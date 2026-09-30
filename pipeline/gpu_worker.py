#!/usr/bin/env python3
"""GPU worker — vyčkává free kapacitu a zpracovává dávky klipů.

Free tiery (Kaggle T4/P100, Colab T4) jsou kapacitní: „Service Unavailable“
nebo „QUEUED“ není chyba, ale čekání. Worker proto:

  1. bere dávky z adresáře fronty (job JSON),
  2. zkusí Colab T4 (nejrychlejší k dispozici, ~15 s na otevření),
  3. jinak pošle batch na Kaggle a čeká ve frontě,
  4. po každém běhu ověří, že klipy dorazily do bucketu a jsou přehratelné,
  5. při chybě nic netajuje — zapíše ji do stavu úlohy (fail-closed).

Úlohy se čtou jako JSON:
  {"id": "...", "owner": "<uuid>", "clips": [{"src_local"|"src_path", "prompt",
   "duration", "seed", "dst_path", ...}]}
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import time
import traceback
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, "/opt/video-agent/pipeline")
import gpu_batch as g  # noqa: E402

QUEUE = Path(os.environ.get("GPU_QUEUE_DIR", "/opt/video-agent/queue"))
STATE = Path(os.environ.get("GPU_STATE_DIR", "/opt/video-agent/state"))
POLL_SECONDS = int(os.environ.get("GPU_POLL_SECONDS", "45"))
BACKEND_PREF = os.environ.get("GPU_BACKEND_PREF", "colab,kaggle")
KAGGLE_WAIT = int(os.environ.get("GPU_KAGGLE_WAIT", "5400"))
MAX_ATTEMPTS = int(os.environ.get("GPU_MAX_ATTEMPTS", "40"))
BACKOFF_SECONDS = int(os.environ.get("GPU_BACKOFF_SECONDS", "300"))

# Bezplatné GPU tiery jsou KAPACITNI: "Service Unavailable" / "QUEUED" neni chyba
# renderu, ale chyba kapacity. Takovou ulohu nevyhazujeme — vratime do fronty.
CAPACITY_MARKERS = (
    "serviceunavailable", "toomanyassignments", "queued", "kapacita nedostupna",
    "capacity", "no accelerator available", "resourceexhausted",
)


def is_capacity_failure(errs: list[str]) -> bool:
    blob = " ".join(errs).lower()
    return any(m in blob for m in CAPACITY_MARKERS)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[logging.FileHandler("/opt/video-agent/logs/gpu-worker.log"),
              logging.StreamHandler()])
log = logging.getLogger("gpu-worker")


def _write_state(job_id: str, state: dict) -> None:
    STATE.mkdir(parents=True, exist_ok=True)
    tmp = STATE / f".{job_id}.tmp"
    tmp.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, STATE / f"{job_id}.json")
    log.info("[%s] %s", job_id, state.get("status"))


def probe_clip(owner: str, dst_path: str) -> dict:
    """Klip je použitelný, jen když je v bucketu a ffprobe ho přečte."""
    out = {"path": dst_path, "ok": False}
    try:
        req = urllib.request.Request(
            f"{g._api_base()}/storage/v1/object/info/{g.BUCKET}/"
            f"{urllib.parse.quote(dst_path)}",
            headers={"apikey": g._service_key(),
                     "Authorization": f"Bearer {g._service_key()}"})
        info = json.loads(urllib.request.urlopen(req, timeout=60).read())
        size = (info.get("metadata") or {}).get("size") or info.get("size") or 0
        out["bytes"] = size
        if size < 50_000:
            out["error"] = f"klip prilis male: {size} B"
            return out
        local = Path(f"/tmp/probe_{Path(dst_path).name}")
        subprocess.run(["curl", "-sS", "-o", str(local), g.sign_download(dst_path)],
                       check=True, timeout=300)
        pr = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
             "stream=width,height,nb_frames", "-of", "json", str(local)],
            capture_output=True, text=True, timeout=120)
        if pr.returncode:
            out["error"] = f"ffprobe: {pr.stderr[:120]}"
            return out
        st = (json.loads(pr.stdout).get("streams") or [{}])[0]
        out.update(width=st.get("width"), height=st.get("height"),
                   frames=st.get("nb_frames"))
        out["ok"] = True
        local.unlink(missing_ok=True)
    except Exception as exc:
        out["error"] = f"{type(exc).__name__}: {str(exc)[:160]}"
    return out


def run_job(job: dict) -> dict:
    job_id = job["id"]
    owner = job["owner"]
    clips = job["clips"]
    for i, c in enumerate(clips):
        c.setdefault("idx", i)
        c.setdefault("dst_path",
                     f"{owner}/videos/clips/{job_id}/clip{i}.mp4")
    _write_state(job_id, {"status": "preparing", "clips": len(clips)})
    payload = g.build_payload(clips, owner=owner, model=job.get("model", "auto"))
    log.info("[%s] payload: %d klipy, %d B kodu",
             job_id, len(clips), len(g.kernel_source(payload)))

    preferred = [b.strip() for b in BACKEND_PREF.split(",") if b.strip()]
    errors = []
    for backend in preferred:
        _write_state(job_id, {"status": f"rendering:{backend}", "clips": len(clips)})
        try:
            if backend == "colab":
                session = g.new_colab_session(attempts=1)
                log.info("[%s] colab session %s", job_id, session)
                res = g.run_colab_batch(payload, session=session,
                                        timeout=job.get("timeout", 7200))
            else:
                res = g.run_kaggle_batch(payload, timeout=KAGGLE_WAIT)
            probes = [probe_clip(owner, c["dst_path"]) for c in clips]
            ok = sum(1 for p in probes if p["ok"])
            status = "done" if ok == len(clips) else "partial"
            _write_state(job_id, {"status": status, "backend": backend,
                                  "model": res.get("model"),
                                  "model_error": res.get("model_error"),
                                  "clips": probes,
                                  "result": res})
            log.info("[%s] %s na %s: %d/%d klipu pouzitelnych (model %s)",
                     job_id, status, backend, ok, len(clips), res.get("model"))
            return {"status": status, "ok": ok, "total": len(clips)}
        except Exception as exc:
            msg = f"{type(exc).__name__}: {str(exc)[:200]}"
            errors.append(f"{backend}: {msg}")
            log.warning("[%s] backend %s selhal: %s", job_id, backend, msg)
            log.debug(traceback.format_exc())
    if is_capacity_failure(errors):
        attempts = int(job.get("attempts", 0)) + 1
        if attempts > MAX_ATTEMPTS:
            _write_state(job_id, {"status": "failed", "errors": errors,
                                  "attempts": attempts,
                                  "reason": "prekrocen limit pokusu o kapacitu"})
            log.error("[%s] limit pokusu o kapacitu vycerpan (%d)", job_id, attempts)
            return {"status": "failed", "errors": errors, "attempts": attempts}
        wait = min(BACKOFF_SECONDS * (1.4 ** (attempts - 1)), 3600)
        job["attempts"] = attempts
        job["not_before"] = time.time() + wait
        _write_state(job_id, {"status": "waiting_for_capacity",
                              "attempts": attempts,
                              "retry_in_s": int(wait),
                              "errors": errors})
        log.info("[%s] kapacita obsazena, znovu za %ds (pokus %d/%d)",
                 job_id, int(wait), attempts, MAX_ATTEMPTS)
        return {"status": "waiting_for_capacity", "attempts": attempts,
                "retry_in_s": int(wait)}
    _write_state(job_id, {"status": "failed", "errors": errors,
                          "attempts": int(job.get("attempts", 0)) + 1})
    log.error("[%s] vsechny backendy selhaly: %s", job_id, " | ".join(errors))
    return {"status": "failed", "errors": errors}


def loop() -> None:
    QUEUE.mkdir(parents=True, exist_ok=True)
    STATE.mkdir(parents=True, exist_ok=True)
    log.info("gpu-worker start, fronta=%s, preferovane=%s", QUEUE, BACKEND_PREF)
    while True:
        jobs = sorted(QUEUE.glob("*.json"))
        if not jobs:
            time.sleep(POLL_SECONDS)
            continue
        for jp in jobs:
            try:
                job = json.loads(jp.read_text(encoding="utf-8"))
            except Exception as exc:
                log.error("rozbitá úloha %s: %s", jp.name, exc)
                jp.rename(jp.with_suffix(".broken"))
                continue
            if float(job.get("not_before", 0)) > time.time():
                continue
            result = run_job(job)
            if result.get("status") == "waiting_for_capacity":
                jp.unlink(missing_ok=True)
                tmp = QUEUE / f".{jp.stem}.retry"
                tmp.write_text(json.dumps(job, ensure_ascii=False, indent=2),
                               encoding="utf-8")
                os.replace(tmp, jp)
            else:
                jp.rename(jp.with_suffix(".done"))
        time.sleep(5)


if __name__ == "__main__":
    if "--once" in sys.argv:
        QUEUE.mkdir(parents=True, exist_ok=True)
        jobs = sorted(QUEUE.glob("*.json"))
        if not jobs:
            print("fronta je prazdna")
            raise SystemExit(0)
        job = json.loads(jobs[0].read_text(encoding="utf-8"))
        result = run_job(job)
        jobs[0].rename(jobs[0].with_suffix(".done"))
        print(json.dumps(result, indent=2))
        raise SystemExit(0 if result.get("status") == "done" else 1)
    loop()

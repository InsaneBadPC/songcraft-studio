"""Dávkové GPU renderování klipů (Kaggle + Colab) přes krátkodobé podepsané URL.

Design
------
Model se stahuje jednou, takže dávka N klipů v jednom běhu stojí zlomkovou cenu.
Jediný přenosný prvek mezi VM a GPU kódem je JSON payload s URL:

  každý klip -> {src_url, dst_url, dst_token}   (krátkodobé, bez dlouhodobých hesel)

Vstupní obrázky se stahují přes podepsanou download URL, výstupní klipy se
nahrávají přes podepsanou upload URL metodou **PUT** (Supabase u POST vrací
falešný "MIME type is not allowed" i pro povolené typy — ověřeno 26. 9. 2026).

Fail-closed: žádný tichý fallback na slideshow ani na statický obrázek. Pokud
model selže, klip v chybové mapě chybí a volající to zjistí.
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
import time
import urllib.parse
import urllib.request
from pathlib import Path

log = logging.getLogger("gpu_batch")

BUCKET = "songcraft"


def _colab_bin() -> str:
    """colab CLI bývá v ~/.local/bin (uv tool) nebo v /usr/local/bin."""
    env = os.environ.get("COLAB_BIN")
    if env:
        return env
    import shutil
    found = shutil.which("colab")
    if found:
        return found
    home = os.environ.get("SONGCRAFT_UBUNTU_HOME", "/home/ubuntu")
    for cand in (f"{home}/.local/bin/colab", "/usr/local/bin/colab",
                 os.path.expanduser("~/.local/bin/colab")):
        if Path(cand).exists():
            return cand
    return f"{home}/.local/bin/colab"


def _colab_token() -> Path:
    home = os.environ.get("SONGCRAFT_UBUNTU_HOME", "/home/ubuntu")
    return Path(os.environ.get("COLAB_TOKEN_FILE",
                               f"{home}/.config/colab-cli/token.json"))


# --------------------------------------------------------------------------
# VM strana: podepsané URL (vyžaduje service_role jen tady, ne v GPU kódu)
# --------------------------------------------------------------------------
def _api_base() -> str:
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    if not base:
        raise RuntimeError("SUPABASE_URL není nastaven")
    return base


def _service_key() -> str:
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY není nastaven")
    return key


def _api(method: str, path: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{_api_base()}/storage/v1{path}",
        data=data,
        method=method,
        headers={
            "apikey": _service_key(),
            "Authorization": f"Bearer {_service_key()}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read().decode())


def sign_download(path: str, ttl: int = 3600) -> str:
    """Krátkodobá download URL pro soukromý objekt."""
    out = _api("POST", f"/object/sign/{BUCKET}/{urllib.parse.quote(path)}",
               {"expiresIn": int(ttl)})
    signed = out.get("signedURL") or out.get("signedUrl") or ""
    if not signed:
        raise RuntimeError(f"sign download selhal pro {path}: {out}")
    # Supabase vrací cestu relativní ke /storage/v1 — bez toho je to 404.
    if signed.startswith("/storage/v1/"):
        return f"{_api_base()}{signed}"
    return f"{_api_base()}/storage/v1{signed}"


def sign_upload(path: str, ttl: int = 3600) -> tuple[str, str]:
    """Krátkodobá (url, token) pro nahrání objektu přes PUT."""
    out = _api("POST", f"/object/upload/sign/{BUCKET}/{urllib.parse.quote(path)}", {})
    url, token = out.get("url"), out.get("token")
    if not url or not token:
        raise RuntimeError(f"sign upload selhal pro {path}: {out}")
    return f"{_api_base()}/storage/v1{url}", token


def put_file(path: str, local: Path, content_type: str = "video/mp4") -> str:
    """VM nahraje soubor do bucketu (přes API, ne podepsanou URL)."""
    data = local.read_bytes()
    req = urllib.request.Request(
        f"{_api_base()}/storage/v1/object/{BUCKET}/{urllib.parse.quote(path)}",
        data=data,
        method="POST",
        headers={
            "apikey": _service_key(),
            "Authorization": f"Bearer {_service_key()}",
            "Content-Type": content_type,
            "x-upsert": "true",
        },
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        return resp.read().decode()[:200]


_STAGED: dict[str, str] = {}


def stage_local(owner: str, local: str | Path, name: str | None = None) -> str:
    """Nahrá vstupní obrázek do soukromého bucketu a vrať jeho cestu.

    GPU kód dostane jen krátkodobou download URL — žádné dlouhodobé heslo
    se nikdy nedostane do notebooku ani do Colab session.
    """
    local = Path(local)
    if not local.exists():
        raise FileNotFoundError(f"vstup neexistuje: {local}")
    if not name:
        import hashlib
        digest = hashlib.sha256(
            f"{local}:{local.stat().st_mtime}:{local.stat().st_size}".encode()
        ).hexdigest()[:12]
        name = f"{local.stem}-{digest}{local.suffix}"
    path = f"{owner}/videos/gpu-inbox/{name}"
    if _STAGED.get(path) != str(local.stat().st_mtime):
        ctype = {".png": "image/png", ".webp": "image/webp"}.get(
            local.suffix.lower(), "image/jpeg")
        put_file(path, local, ctype)
        _STAGED[path] = str(local.stat().st_mtime)
        log.info("[stage] %s (%d B) -> %s", local.name, local.stat().st_size, path)
    return path


# --------------------------------------------------------------------------
# Payload
# --------------------------------------------------------------------------
def build_payload(clips: list[dict], owner: str, model: str = "auto",
                  workdir: str = "/kaggle/working") -> dict:
    """Připraví payload: ke každému klipu podepsané vstupní a výstupní URL.

    Každý klip: {"src_path"|"src_local", "dst_path", "prompt", "duration", "seed", ...}
    """
    prepared = []
    for i, clip in enumerate(clips):
        src_path = clip.get("src_path")
        if not src_path:
            src_path = stage_local(owner, clip["src_local"])
        elif clip.get("src_local"):
            src_path = stage_local(owner, clip["src_local"])
        dst_path = clip["dst_path"]
        dst_url, dst_token = sign_upload(dst_path)
        prepared.append({
            "idx": i,
            "seed": int(clip.get("seed", 1000 + i)),
            "duration": int(clip.get("duration", 4)),
            "prompt": clip.get("prompt", ""),
            "width": int(clip.get("width", 832)),
            "height": int(clip.get("height", 480)),
            "motion": int(clip.get("motion", 140)),
            "src_url": sign_download(src_path),
            "dst_url": dst_url,
            "dst_token": dst_token,
        })
    return {"owner": owner, "model": model, "workdir": workdir, "clips": prepared}


# --------------------------------------------------------------------------
# GPU kód — běží uvnitř Kaggle kernelu nebo Colab session
# --------------------------------------------------------------------------
KERNEL_SRC = r'''
import json, os, sys, time, traceback, urllib.request

PAYLOAD = json.loads(r"""__PAYLOAD__""")
WORK = PAYLOAD.get("workdir") or "/kaggle/working"
os.makedirs(WORK, exist_ok=True)
CLIPS = PAYLOAD["clips"]


def log(msg):
    print(f"[gpu] {msg}", flush=True)


def fetch(url, dest):
    with urllib.request.urlopen(url, timeout=300) as r, open(dest, "wb") as f:
        f.write(r.read())
    return os.path.getsize(dest)


def push(url, token, src):
    """Nahraje mp4 na podepsanou URL. Pozor: musí to být PUT, ne POST."""
    size = os.path.getsize(src)
    req = urllib.request.Request(url, data=open(src, "rb").read(), method="PUT",
                                 headers={"Authorization": "Bearer " + token,
                                          "Content-Type": "video/mp4"})
    with urllib.request.urlopen(req, timeout=900) as r:
        body = r.read().decode()[:200]
    log(f"upload {size} B -> {body}")


results = {"ok": [], "failed": [], "model": None, "model_error": None}
LOGTAIL = []


def note(msg):
    LOGTAIL.append(str(msg)[-500:])
    del LOGTAIL[:-25]

import torch
log(f"torch {torch.__version__} cuda={torch.cuda.is_available()} "
    f"gpu={torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'none'}")
if not torch.cuda.is_available():
    raise SystemExit("GPU neni dostupne")

from PIL import Image

pipe = None
backend = None


def load_wan():
    global pipe
    from diffusers import WanImageToVideoPipeline
    log("loading Wan2.2-TI2V-5B ...")
    pipe = WanImageToVideoPipeline.from_pretrained(
        "Wan-AI/Wan2.2-TI2V-5B", torch_dtype=torch.float16)
    pipe.enable_model_cpu_offload()
    pipe.enable_vae_slicing()
    log("Wan2.2-TI2V-5B ready")
    return "wan2.2-ti2v-5b"


def load_svd():
    global pipe
    from diffusers import StableVideoDiffusionPipeline
    log("loading SVD-XT ...")
    pipe = StableVideoDiffusionPipeline.from_pretrained(
        "vdo/stable-video-diffusion-img2vid-xt-1-1", torch_dtype=torch.float16)
    pipe.enable_model_cpu_offload()
    log("SVD ready")
    return "svd-xt"


want = PAYLOAD.get("model", "auto")
try:
    if want in ("auto", "wan5b"):
        backend = load_wan()
    else:
        backend = load_svd()
except Exception:
    tb = traceback.format_exc()
    log("Wan se nenačetl, fallback SVD:\n" + tb)
    results["model_error"] = tb[-1200:]
    backend = load_svd()
results["model"] = backend
if backend != "wan2.2-ti2v-5b":
    results["note"] = "Wan2.2-TI2V-5B se nepodailo nalozit, bezny byl SVD-XT"
log(f"backend = {backend}")
log(f"VRAM total {torch.cuda.get_device_properties(0).total_memory / 2**30:.1f} GiB")


def gen_wan(img, clip):
    fps = 16
    frames = max(25, min(81, int(clip["duration"] * fps) // 4 * 4 + 1))
    out = pipe(image=img, height=clip["height"], width=clip["width"],
               num_frames=frames, num_inference_steps=25, guidance_scale=5.0,
               generator=torch.Generator("cpu").manual_seed(clip["seed"]))
    return out.frames[0], min(16, len(out.frames[0]) // max(1, int(clip["duration"])))


def gen_svd(img, clip):
    out = pipe(image=img.resize((576, 320)), num_frames=25,
               num_inference_steps=25, decode_chunk_size=8,
               generator=torch.Generator("cpu").manual_seed(clip["seed"]),
               motion_bucket_id=clip["motion"], noise_aug_strength=0.02)
    return out.frames[0], 8


gen = gen_wan if backend.startswith("wan") else gen_svd

from diffusers.utils import export_to_video

for clip in CLIPS:
    idx = clip["idx"]
    src = os.path.join(WORK, f"in_{idx}.png")
    dst = os.path.join(WORK, f"out_{idx}.mp4")
    t0 = time.time()
    try:
        n = fetch(clip["src_url"], src)
        log(f"clip {idx}: vstup {n} B, {clip['width']}x{clip['height']}, "
            f"{clip['duration']}s, prompt={clip['prompt'][:60]!r}")
        img = Image.open(src).convert("RGB")
        frames, fps = gen(img, clip)
        export_to_video(frames, dst, fps=fps)
        size = os.path.getsize(dst)
        if size < 50_000:
            raise RuntimeError(f"klip podezele male: {size} B")
        push(clip["dst_url"], clip["dst_token"], dst)
        log(f"clip {idx}: HOTOVO {size} B za {time.time() - t0:.0f}s")
        results["ok"].append({"idx": idx, "bytes": size, "secs": round(time.time() - t0)})
    except Exception as exc:
        tb = traceback.format_exc()
        log(f"clip {idx}: SELHALO {exc}\n{tb}")
        note(tb)
        results["failed"].append({"idx": idx, "error": str(exc)[:300],
                                  "trace": tb[-800:]})
    finally:
        for p in (src, dst):
            try:
                os.remove(p)
            except OSError:
                pass

results["log_tail"] = LOGTAIL
with open(os.path.join(WORK, "result.json"), "w") as f:
    json.dump(results, f)
log("VYSLEDEK " + json.dumps(results))
print("RESULT_JSON " + json.dumps(results), flush=True)
'''


def kernel_source(payload: dict) -> str:
    """Vloží payload do kódu. JSON je malý (jen URL), limity Kaggle snese."""
    blob = json.dumps(payload).replace('"""', '\\"\\"\\"')
    return KERNEL_SRC.replace("__PAYLOAD__", blob)


# --------------------------------------------------------------------------
# Backend: Kaggle
# --------------------------------------------------------------------------
def _kaggle_env() -> dict:
    return {**os.environ, "KAGGLE_API_TOKEN": os.environ.get("KAGGLE_KEY", "")}


def _kaggle(args: list[str], timeout: int = 300) -> str:
    r = subprocess.run(["kaggle", *args], capture_output=True, text=True,
                       env=_kaggle_env(), timeout=timeout)
    if r.returncode:
        raise RuntimeError(f"kaggle {' '.join(args)} rc={r.returncode}: {r.stderr[:300]}")
    return r.stdout


def _kernel_metadata(name: str, user: str) -> dict:
    return {
        "id": f"{user}/{name}", "title": name, "code_file": f"{name}.py",
        "language": "python", "kernel_type": "script", "is_private": True,
        "enable_gpu": True, "enable_internet": True,
        "dataset_sources": [], "competition_sources": [], "model_sources": [],
    }


def run_kaggle_batch(payload: dict, user: str | None = None,
                     kernel: str | None = None, timeout: int = 5400) -> dict:
    """Nahraje kernel s dávkou, spustí, počká a vrátí jeho výsledek.

    Vlastní slug, aby se paralelní běhy navzájem nepřepisovaly.
    """
    import tempfile
    user = user or os.environ.get("KAGGLE_USERNAME", "petrinsane")
    kernel = kernel or os.environ.get("GPU_KAGGLE_KERNEL", "sc-batch")

    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        (td / f"{kernel}.py").write_text(kernel_source(payload), encoding="utf-8")
        (td / "kernel-metadata.json").write_text(
            json.dumps(_kernel_metadata(kernel, user), indent=2), encoding="utf-8")
        _kaggle(["kernels", "push", "-p", str(td), "--accelerator", "GPU"], timeout=300)

    slug = f"{user}/{kernel}"
    deadline = time.time() + timeout
    while time.time() < deadline:
        status = _kaggle(["kernels", "status", slug], timeout=60).strip().lower()
        log.info("[kaggle] %s -> %s", slug, status)
        if "complete" in status:
            return collect_results(slug, payload)
        if "error" in status:
            raise RuntimeError(f"kernel {slug} selhal: {status}")
        time.sleep(30)
    raise RuntimeError(f"kernel {slug} nestihl za {timeout}s")


def collect_results(slug: str, payload: dict) -> dict:
    """Stáhne result.json z běhu. Klipy jsou mezitím v bucketu přes podepsané URL."""
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        _kaggle(["kernels", "output", slug, "-p", td], timeout=300)
        cand = list(Path(td).rglob("result.json"))
        if cand:
            return json.loads(cand[0].read_text())
    return {"ok": [], "failed": [{"error": "result.json se nepodarilo stahnout"}],
            "model": None, "kernels": [slug]}


# --------------------------------------------------------------------------
# Backend: Google Colab CLI
# --------------------------------------------------------------------------
def run_colab_batch(payload: dict, session: str | None = None,
                    timeout: int = 5400, script: str = "/tmp/sc_batch.py") -> dict:
    """Spustí dávku v Colab session (nebo nové). Vyžaduje `colab login`."""
    Path(script).write_text(kernel_source(payload), encoding="utf-8")
    if not session:
        session = new_colab_session()
    r = subprocess.run(
        [_colab_bin(), "exec", "-s", session, "-f", script, "--timeout", str(timeout)],
        capture_output=True, text=True, timeout=timeout + 300)
    combined = (r.stdout or "") + "\n" + (r.stderr or "")
    log.info("[colab] rc=%d, %d B vystupu", r.returncode, len(combined))
    res = parse_result_marker(combined)
    if not res.get("ok") and not res.get("failed"):
        res["failed"] = [{"error": "colab vystup neparsovan"}]
    res["colab_tail"] = combined[-2500:]
    res["colab_rc"] = r.returncode
    return res


def new_colab_session(gpu: str = "T4", attempts: int = 1, wait: int = 25):
    """T4 je na free tieru kapacitně omezený; L4/G4 free účet nemá vůbec."""
    last = ""
    for i in range(attempts):
        r = subprocess.run([_colab_bin(), "new", "--gpu", gpu],
                           capture_output=True, text=True, timeout=600)
        out = (r.stdout or "") + (r.stderr or "")
        last = out[-200:]
        if "Service Unavailable" in out or "TooManyAssignments" in out:
            log.info("[colab] kapacita nedostupna (pokus %d/%d)", i + 1, attempts)
            time.sleep(wait)
            continue
        if "Backend rejected" in out:
            raise RuntimeError(f"Colab odmítl {gpu}: {last}")
        m = parse_session_name(out)
        if m:
            return m
    raise RuntimeError(f"Colab T4 nedostupne po {attempts} pokusech: {last}")


def parse_session_name(out: str) -> str | None:
    import re
    m = re.search(r"Creating session '([^']+)'", out)
    return m.group(1) if m else None


def parse_result_marker(text: str) -> dict:
    for line in reversed(text.splitlines()):
        if line.startswith("RESULT_JSON "):
            return json.loads(line[len("RESULT_JSON "):])
    return {"ok": [], "failed": [{"error": "RESULT_JSON vystup chybi"}], "model": None}


def colab_available() -> dict:
    """Je colab CLI nainstalované a přihlášené?"""
    binp = Path(_colab_bin())
    tok = _colab_token()
    return {"bin": str(binp), "cli": binp.exists(), "authenticated": tok.exists()}

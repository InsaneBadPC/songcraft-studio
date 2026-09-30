"""Oživený záběr: pohyblivý subjekt + kouř, uzavřený v nekonečnou smyčku.

Nápad: místo generovat minutu videa vygenerujeme JEDEN krátký pohyb a délku
skládáme z jeho opakování. Model tak dostane snadný úkol (pohyb postavy,
kouř) místo složité celé scény.

Smyčka musí být dokonale uzavřená — jinak je okem vidět opakování. Proto je
veškerý pohyb periodický s periodou, která je celočíselný dělitel délky
scény: dýchání i kouří se vrátí přesně do výchozí polohy.

Složení (odzadu):
    1. parallax pozadí  (parallax.py) - hloubka z photoshopu
    2. pohyblivý subjekt - dýchání (zoom) + sway, sinusovka = uzavřená smyčka
    3. kouř             - numpy částice, vystupující, expandující, blednoucí
    4. zrno, vinieta, sweep
"""
from __future__ import annotations

import math
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageFilter

import parallax as px

FFMPEG = px.FFMPEG


# --------------------------------------------------------------------------
# Kouř
# --------------------------------------------------------------------------
@dataclass
class SmokeSpec:
    """Kouřový proud. Všechno je vztaženo k cyklu, proto je smyčka uzavřená."""
    origin: tuple[float, float] = (0.5, 0.62)   # relativni pozice v ploše kadru
    rise: float = 0.42                          # jak vysoko vystoupí za cyklus
    spread: float = 0.13                         # rozptyl vodorovně
    grow: float = 2.6                            # násobné zvětšení částice
    particles: int = 34
    strength: float = 0.30                       # 0-1, jak moc je vidět
    color: tuple[int, int, int] = (228, 226, 232)
    width: int = 420                            # šířka oblasti, která se renderuje
    swirl: float = 0.35                         # víření


def render_smoke(spec: SmokeSpec, seconds: float, fps: int, workdir: Path) -> Path:
    """Vygeneruje PNG sekvenci kouře. Cesta 1 = N frames."""
    workdir.mkdir(parents=True, exist_ok=True)
    n = max(2, int(round(seconds * fps)))
    w = spec.width
    # zachováme poměr stran kadru
    h = int(w * 9 / 16)
    x0 = spec.origin[0] * w
    y0 = spec.origin[1] * h
    rise_px = spec.rise * h

    # castice: faze, velikost, vodorovna odchylka - deterministicke
    rng = np.random.default_rng(12345)
    phase = rng.random(spec.particles)
    r0 = rng.uniform(0.035, 0.085, spec.particles)
    lateral = rng.uniform(-1.0, 1.0, spec.particles)
    speed = rng.uniform(0.82, 1.18, spec.particles)

    base = int(255 * spec.strength)
    cols = (spec.color[0] * base // 255, spec.color[1] * base // 255,
            spec.color[2] * base // 255)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)

    for f in range(n):
        t = f / n                       # 0..1, na konci = 0 => uzavrena smycka
        acc = np.zeros((h, w), dtype=np.float32)
        for i in range(spec.particles):
            u = (t * speed[i] + phase[i]) % 1.0          # 0..1, wrap = smycka
            y = y0 - rise_px * u
            # vodorovne rozvitrati - taky periodicky pres u
            x = x0 + lateral[i] * spec.spread * w * math.sin(u * math.pi * 2)
            r = max(2.0, r0[i] * (1.0 + spec.grow * u) * w)
            d2 = (xx - x) ** 2 + (yy - y) ** 2
            blob = np.exp(-d2 / (2.0 * r * r))
            # fade: nechat se objevit dole, vyhasnout nahore
            alpha = math.sin(math.pi * u) ** 0.8
            acc += blob * alpha
        acc /= max(1.0, acc.max())
        rgb = np.empty((h, w, 3), dtype=np.uint8)
        for c in range(3):
            rgb[..., c] = np.clip(acc * cols[c], 0, 255).astype(np.uint8)
        Image.fromarray(rgb, "RGB").save(workdir / f"smk_{f:04d}.png")

    # ffmpeg potrebuje VZOR, ne jeden soubor - bez %04d nenačte sekvenci
    return workdir / "smk_0000.png"


def looped_smoke_input(first: Path) -> list[str]:
    """Vstup pro ffmpeg: cela sekvence v opakovane smycce."""
    pattern = first.parent / "smk_%04d.png"
    return ["-stream_loop", "-1", "-framerate", "24", "-i", str(pattern)]


# --------------------------------------------------------------------------
# Pohyblivý subjekt
# --------------------------------------------------------------------------
def subject_layer(image: Path, workdir: Path, width: int, height: int,
                  feather: float = 0.5) -> tuple[Path, dict]:
    """Ostro subjekt s alfou + jeho poloha v ploše."""
    from parallax import _soft_ellipse, find_subject
    workdir.mkdir(parents=True, exist_ok=True)
    base = Image.open(image).convert("RGB")
    ratio = base.width / base.height
    if abs(ratio - width / height) > 0.02:
        if ratio > width / height:
            nw = int(base.height * width / height)
            left = (base.width - nw) // 2
            base = base.crop((left, 0, left + nw, base.height))
        else:
            nh = int(base.width * height / width)
            top = int((base.height - nh) * 0.35)
            base = base.crop((0, top, base.width, top + nh))
    base = base.resize((width, height), Image.LANCZOS)
    cx, cy, spread = find_subject(base)
    mask = _soft_ellipse((width, height), cx, cy, spread,
                         spread * (height / width) * 1.15, feather=feather)
    rgba = base.convert("RGBA")
    rgba.putalpha(mask)
    p = workdir / "subject.png"
    rgba.save(p)
    return p, {"cx": cx, "cy": cy, "spread": spread, "frames_alpha_feather": feather}


def living_subject_filter(index: int, width: int, height: int, frames: int,
                          fps: int, cycles: float, breath: float = 0.014,
                          sway: float = 0.55, subject_cx: float = 0.5,
                          phase: float = 0.0) -> str:
    """zoompan se sinusovkou = dýchání + sway, uzavřená smyčka.

    cykly musí být celé cislo, jinak se konec nespojuje se zacatkem.
    """
    c = max(1, int(round(cycles)))
    zoom = f"1.018+{breath}*sin(2*PI*on/{frames}/{c}+{phase:.4f})"
    off = 0.06 * (subject_cx - 0.5)
    x = (f"(iw-iw/zoom)*({0.5 + off:.4f})"
         f"+{sway*7:.3f}*sin(2*PI*on/{frames}/{c}+{phase:.4f})")
    y = (f"(ih-ih/zoom)*0.5+{sway*4}*cos(2*PI*on/{frames}/{c}+{phase:.4f})")
    return (f"[{index}:v]scale={int(width*1.5)//2*2}:{int(height*1.5)//2*2}:flags=bilinear,"
            f"zoompan=z='{zoom}':x='{x}':y='{y}':d={frames}:s={width}x{height}"
            f":fps={fps},setsar=1[subj]")


def render_living_scene(image: Path, duration: float, out: Path, workdir: Path,
                        profile: str = "drift_l", width: int = 1280,
                        height: int = 720, fps: int = 24, seed: int = 0,
                        crop_bias: tuple = (0.0, 0.0), crop_zoom: float = 1.0,
                        smoke: SmokeSpec | None = None,
                        smoke_strength: float = 0.22,
                        i2v_clip: Path | None = None) -> dict:
    """Kompletní živý záběr: parallax + pohyblivý subjekt + kouř.

    duration musí být násobek cyklu dýchání i kouře, jinak smyčka švihne.
    """
    prof = px.PROFILES[profile] if isinstance(profile, str) else profile
    workdir.mkdir(parents=True, exist_ok=True)
    frames = max(4, int(round(duration * fps)))

    # --- rovina pozadi z parallax vrstev
    info = px.build_layers(image, workdir, prof, width, height,
                           crop_bias=crop_bias, crop_zoom=crop_zoom)
    paths = info["paths"]

    # --- subjekt
    subj_path, meta = subject_layer(image, workdir / "subj", width, height)

    # rovina kouře
    smoke_first = None
    if smoke is not None and smoke_strength > 0.01:
        sp = SmokeSpec(**{**smoke.__dict__})
        sp.strength = smoke_strength
        smoke_first = render_smoke(sp, duration, fps, workdir / "smoke")

    inputs = [
        *[x for p in paths.values()
          for x in ("-loop", "1", "-t", f"{frames / fps + 0.4:.3f}", "-i", str(p))],
        "-loop", "1", "-t", f"{frames / fps + 0.4:.3f}", "-i", str(subj_path),
    ]
    subj_idx = 3
    if smoke_first is not None:
        inputs += looped_smoke_input(smoke_first)
        smoke_idx = 4

    # --- filtry vrstev (parallax) - beze zmeny, vezmu z parallax
    z0 = px._zq(0, width, height, prof.far_zoom,
                (info["subject"]["cx"] - 0.5) * 0.30 + prof.far_pan,
                (info["subject"]["cy"] - 0.5) * 0.22 + prof.far_pan * 0.5, frames, fps)
    z1 = px._zq(1, width, height, prof.mid_zoom,
                (info["subject"]["cx"] - 0.5) * 0.55 + prof.mid_pan,
                (info["subject"]["cy"] - 0.5) * 0.40 + prof.mid_pan * 0.5, frames, fps)
    # treti vrstva parallax (near) nahradime POHYBLIVYM subjektem
    cycles = max(1, int(round(duration / 4.0)))
    z2 = living_subject_filter(subj_idx, width, height, frames, fps, cycles,
                               breath=0.012 + 0.010 * (seed % 3),
                               sway=0.6 + 0.2 * (seed % 2),
                               subject_cx=meta["cx"], phase=(seed % 7) * 0.31)

    parts = [z0, z1, z2,
             f"[v0][v1]overlay=x=0:y=0:format=auto:eval=frame[o1]",
             f"[o1][subj]overlay=x=0:y=0:format=auto:eval=frame[b0]"]
    last = "b0"
    if smoke_first is not None:
        # kour ma vlastni rozmery -> rozsirime na cely kadr a screen blend
        parts.append(f"[{smoke_idx}:v]scale={width}:{height}:flags=bicubic,"
                     f"format=rgba,colorchannelmixer=aa=0.55[sa]")
        parts.append(f"[{last}][sa]overlay=x=0:y=0:format=auto:eval=frame[b1]")
        last = "b1"
    parts.append(f"[{last}]eq=brightness='{prof.breathe}*sin(2*PI*t/"
                 f"{max(0.5, duration):.3f})':eval=frame[b2]")
    last = "b2"
    if prof.sweep:
        band = workdir / "sweep.png"
        px._make_sweep(band, width, height, max(0.6, duration * 0.8))
        inputs += ["-loop", "1", "-t", f"{frames / fps + 0.4:.3f}", "-i", str(band)]
        sw_idx = smoke_idx + 1 if smoke_first is not None else 4
        parts.append(f"[{sw_idx}:v]format=rgba,colorchannelmixer=aa=0.14[sw]")
        parts.append(f"[{last}][sw]overlay=x='-{width}*t/"
                     f"{max(0.6, duration * 0.8):.3f}':y=0:format=auto:eval=frame[b3]")
        last = "b3"
    parts.append(f"[{last}]vignette=angle=PI/4.2,noise=alls={int(prof.grain)}:allf=t+u,"
                 f"format=yuv420p[vout]")

    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
           "-filter_threads", "1", "-threads", "2",
           *inputs, "-filter_complex", ";".join(parts), "-map", "[vout]",
           "-r", str(fps), "-t", f"{frames / fps:.3f}", "-c:v", "libx264",
           "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", str(out)]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    if r.returncode:
        how = "OOM/SIGKILL" if r.returncode == -9 else f"rc={r.returncode}"
        raise RuntimeError(f"ffmpeg selhal ({how}): {r.stderr[-500:] or '(prazdny)'}")
    for p in paths.values():
        p.unlink(missing_ok=True)
    return {"out": str(out), "seconds": round(duration, 2), "bytes": out.stat().st_size,
            "profile": prof.name, "smoke": smoke_first is not None,
            "breath_cycles": cycles, "loop_exact": True}

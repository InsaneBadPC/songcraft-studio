"""Recept pohybu v2: rozpohybuje TO, co je v promptu, ne vymyšlené efekty.

Chyba v1: recept měl soupis efektů (kouř, déšť, bokeh) a já je házel do
každého videa. To je přesně to, co nemá být — uživatel píše, co se má hýbat.

V2: recept popisuje PRVKY z obrázku. Agent (vidí fotku) z promptu "roztoč
kolo" nebo "nech světla blikat" určí:
    what    - co to je (popis, pro audit)
    region  - kde to v obrázku je [x0, y0, x1, y1] relativně 0..1
    anchor  - střed otáčení (pro rotate)
    motion  - jak se to hýbe

Podporované pohyby: rotate, blink, breathe, sway, pulse, i2v.
Nic se nepřidává, co uživatel neřekl. Jediný automatický efekt je pomalý
celkový nájezd, protože bez něj je to statický snímek — a to je standard
"living posteru", ne vymyšlený efekt.
"""
from __future__ import annotations

import json
import math
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

import parallax as px

VERSION = 2
MOTION_TYPES = {"rotate", "blink", "breathe", "sway", "pulse", "i2v"}


# --------------------------------------------------------------------------
# Validace - fail-closed
# --------------------------------------------------------------------------
def validate(recipe: dict) -> dict:
    if not isinstance(recipe, dict):
        raise ValueError("recept musi byt objekt")
    v = int(recipe.get("version", 0))
    if v != VERSION:
        raise ValueError(f"recept verze {v} nepodporovana (cekám {VERSION})")
    els = recipe.get("elements")
    if not isinstance(els, list) or not els:
        raise ValueError("recept musi mit aspon jeden prvek 'elements'")
    clean = []
    for e in els:
        if not isinstance(e, dict):
            raise ValueError(f"prvek neni objekt: {e!r}")
        m = e.get("motion") or {}
        if "type" not in m:
            raise ValueError(f"prvku chybi motion.type: {e!r}")
        if m["type"] not in MOTION_TYPES:
            raise ValueError(f"neznamy pohyb '{m['type']}', povolene: "
                             f"{', '.join(sorted(MOTION_TYPES))}")
        reg = e.get("region")
        if not (isinstance(reg, (list, tuple)) and len(reg) == 4):
            raise ValueError(f"prvku chybi region [x0,y0,x1,y1]: {e!r}")
        x0, y0, x1, y1 = (float(v) for v in reg)
        if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
            raise ValueError(f"region mima obraz: {reg}")
        a = e.get("anchor")
        anchor = (float(a[0]), float(a[1])) if isinstance(a, (list, tuple)) and len(a) == 2 \
            else ((x0 + x1) / 2, (y0 + y1) / 2)
        clean.append({
            "what": str(e.get("what", "prvek"))[:120],
            "region": (x0, y0, x1, y1),
            "anchor": anchor,
            "motion": {
                "type": m["type"],
                "amplitude": float(m.get("amplitude", 0.03)),
                "degrees": float(m.get("degrees", 360.0)),
                "cycles": max(1, int(m.get("cycles", 2))),
                "sharpness": float(m.get("sharpness", 0.35)),
                "prompt": str(m.get("prompt", ""))[:300],
                "seed": int(m.get("seed", 7)),
            },
            "mask": str(e.get("mask", "auto")),
            "blur": float(e.get("blur", 0.0)),
        })
    bg = recipe.get("background") or {}
    return {
        "version": VERSION,
        "shot_seconds": float(recipe.get("shot_seconds", 6)),
        "push": float(bg.get("push", 0.05)),
        "motion": str(bg.get("motion", "push")),
        "variants": max(1, min(30, int(recipe.get("variants", 8)))),
        "elements": clean,
        "note": str(recipe.get("note", ""))[:400],
    }


# --------------------------------------------------------------------------
# Vytažení prvku do vrstvy s alfou
# --------------------------------------------------------------------------
def extract_element(image: Image.Image, region: tuple, feather: float = 0.35,
                    mask: str = "auto", anchor: tuple | None = None
                    ) -> tuple[Image.Image, Image.Image]:
    """Vytáhne prvek z obrázku. Vrací (vrstva RGBA, zrcadlová podložka).

    Podložka je obrázek BEZ prvku (překrytá výplní okolí), aby při pohybu
    nevznikla černá díra. Bez ML segmentace používáme barevný odstup od
    okolí bounding boxu — na ilustracích a portrétech s kontrastním
    pozadím funguje, jinak se maska softly roztáhne a je to jen hloubka.
    """
    W, H = image.size
    x0, y0, x1, y1 = region
    px0, py0 = int(x0 * W), int(y0 * H)
    px1, py1 = max(px0 + 8, int(x1 * W)), max(py0 + 8, int(y1 * H))
    box_w, box_h = px1 - px0, py1 - py0

    # maska
    if mask == "rect":
        m = Image.new("L", (box_w, box_h), 255)
    else:
        m = Image.new("L", (box_w, box_h), 0)
        d = ImageDraw.Draw(m)
        d.ellipse([0, 0, box_w - 1, box_h - 1], fill=255)
        if anchor:
            ax = (anchor[0] * W) - px0
            ay = (anchor[1] * H) - py0
            # kotva musi byt uvnitr - jinak maska nesedi na to, co se toci
            cx = min(max(ax, box_w * 0.12), box_w * 0.88)
            cy = min(max(ay, box_h * 0.12), box_h * 0.88)
            rx, ry = cx, box_h * 0.5
            d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
        m = m.filter(ImageFilter.GaussianBlur(max(2.0, feather * min(box_w, box_h) * 0.3)))

    crop = image.crop((px0, py0, px1, py1))
    layer = crop.convert("RGBA")
    layer.putalpha(m)

    # podložka bez prvku: jemne rozmazane okoli + tmavsi vysvetleni, at to
    # nepulzuje jako bila dira
    ring = image.crop((max(0, px0 - box_w // 5), max(0, py0 - box_h // 5),
                       min(W, px1 + box_w // 5), min(H, py1 + box_h // 5)))
    ring = ring.filter(ImageFilter.GaussianBlur(max(3.0, min(box_w, box_h) * 0.18)))
    ring = ImageChops.multiply(ring, Image.new("RGB", ring.size, (120, 122, 130)))
    plate = Image.new("RGB", (W, H), (10, 10, 12))
    plate.paste(ring, (max(0, px0 - box_w // 5), max(0, py0 - box_h // 5)))
    return layer, plate


# --------------------------------------------------------------------------
# Filtry pro jednotlive pohyby
#
# Vrstva je uz oriznuta na svuj region, takze se pohybuje ve sve vlastni
# velikosti a pak se vlozi na sve misto. Rotace se toci kolem stredu prvku.
# --------------------------------------------------------------------------
def _t(dur: float, cycles: int) -> float:
    """Perioda v sekundach - vzdy delitelna delkou, aby smycka tuhla."""
    return max(0.5, dur / max(1, cycles))


def element_filter(el: dict, src: int, ew: int, eh: int, frames: int,
                   fps: int, dur: float) -> str:
    """Pohyb prvku. Vraci filtr s vystupem popisky [el]."""
    m = el["motion"]
    t = m["type"]
    per = _t(dur, m["cycles"])
    amp = max(0.0, min(0.5, m["amplitude"]))
    tag = f"[el{src}]"

    if t == "rotate":
        deg = m["degrees"] if abs(m["degrees"]) >= 360 else 360.0
        # Otoceni se vetsi nez original, jinak se to porovna orezava.
        # crop NEUMI rotw(iw) - proto si rozmery spocitame tady.
        cw = int(math.ceil(math.hypot(ew, eh) / 2) * 2)
        ch = int(math.ceil(math.hypot(ew, eh) / 2) * 2)
        ox = max(0, (cw - ew) // 2)
        oy = max(0, (ch - eh) // 2)
        # cely kolo za periodu = 360 stupnu -> smycka se spoji
        return (f"[{src}:v]format=rgba,rotate=a='{deg:.3f}*t/{per:.4f}':"
                f"ow={cw}:oh={ch}:fillcolor=black@0,"
                f"crop={ew}:{eh}:{ox}:{oy}{tag}")

    if t in ("breathe", "pulse", "sway"):
        # zoompan NEMA promennou t - ma on (cislo snimku). Cas = on/fps.
        nper = max(1.0, per * fps)
        z = f"1+{amp}*sin(2*PI*on/{nper:.4f})"
        if t == "sway":
            x = f"(iw-iw/zoom)/2+{amp * ew * 1.6:.2f}*sin(2*PI*on/{nper:.4f})"
            y = f"(ih-ih/zoom)/2+{amp * eh * 0.6:.2f}*cos(2*PI*on/{nper:.4f})"
        else:
            x = "(iw-iw/zoom)/2"
            y = "(ih-ih/zoom)/2"
        eq = ""
        if t == "pulse":
            eq = (f",eq=brightness='{amp * 1.7:.4f}"
                  f"*sin(2*PI*t/{per})':eval=frame")
        return (f"[{src}:v]scale={ew * 2}:{eh * 2}:flags=bicubic,"
                f"zoompan=z='{z}':x='{x}':y='{y}':d={frames}:s={ew}x{eh}"
                f":fps={fps}{eq},format=rgba{tag}")

    if t == "blink":
        k = max(0.06, min(1.0, m["sharpness"]))
        pulse = f"(abs(mod(t/{per:.4f},1)-0.5)*2)"
        sharp = f"pow({pulse},{1.0 / k:.3f})"
        return (f"[{src}:v]eq=brightness='0.6*{sharp}':eval=frame,format=rgba{tag}")

    # i2v - klip uz je normalizovany na region
    return f"[{src}:v]scale={ew}:{eh}:flags=bicubic,format=rgba{tag}"


# --------------------------------------------------------------------------
# Render
# --------------------------------------------------------------------------
def render_recipe_shot(image: Path, recipe: dict, out: Path, workdir: Path,
                       width: int = 1280, height: int = 720, fps: int = 24,
                       index: int = 0) -> dict:
    """Jeden zaber: pomaly najezd pozadi + prvky z receptu, ty se hybaji."""
    r = validate(recipe)
    workdir.mkdir(parents=True, exist_ok=True)
    dur = r["shot_seconds"]
    frames = max(4, int(round(dur * fps)))

    base_im = _fit(Image.open(image).convert("RGB"), width, height)

    # --- pozadi: pomaly nejrychlejsi pohyb, jediny automaticky pridany efekt
    plate = workdir / "plate.png"
    _fit(Image.open(image).convert("RGB"), width, height).save(plate)
    inputs = ["-loop", "1", "-t", f"{dur + 0.4:.3f}", "-i", str(plate)]

    # --- prvky
    elements = []
    for n, el in enumerate(r["elements"]):
        ew = max(16, int((el["region"][2] - el["region"][0]) * width))
        eh = max(16, int((el["region"][3] - el["region"][1]) * height))
        layer, _plate = extract_element(base_im, el["region"], mask=el["mask"],
                                        anchor=el["anchor"])
        layer = layer.resize((ew, eh), Image.LANCZOS)
        p = workdir / f"el_{n}.png"
        layer.save(p)
        inputs += ["-loop", "1", "-t", f"{dur + 0.4:.3f}", "-i", str(p)]
        elements.append((el, n + 1, ew, eh))

    push = max(0.0, min(0.4, r["push"]))
    parts = [f"[0:v]scale={width*2}:{height*2}:flags=bicubic,"
             f"zoompan=z='1+{push}*min(1,on/{frames})'"
             f":x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2'"
             f":d={frames}:s={width}x{height}:fps={fps},setsar=1[bg]"]
    last = "bg"
    for n, (el, src, ew, eh) in enumerate(elements):
        parts.append(element_filter(el, src, ew, eh, frames, fps, dur))
        x = int(el["region"][0] * width)
        y = int(el["region"][1] * height)
        parts.append(f"[{last}][el{src}]overlay=x={x}:y={y}:format=auto"
                     f":eval=frame[o{n}]")
        last = f"o{n}"
    parts.append(f"[{last}]noise=alls=4:allf=t+u,format=yuv420p[vout]")

    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [px.FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
           "-filter_threads", "1", "-threads", "2", *inputs,
           "-filter_complex", ";".join(parts), "-map", "[vout]",
           "-r", str(fps), "-t", f"{frames / fps:.3f}", "-c:v", "libx264",
           "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", str(out)]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    if res.returncode:
        how = "OOM" if res.returncode == -9 else f"rc={res.returncode}"
        raise RuntimeError(f"ffmpeg selhal ({how}): {res.stderr[-450:] or '(prazdny)'}")
    return {"out": str(out), "seconds": dur, "bytes": out.stat().st_size,
            "hýbe_se": [e["what"] for e in r["elements"]],
            "pohyby": [e["motion"]["type"] for e in r["elements"]],
            "loop_exact": True}


def _fit(im: Image.Image, width: int, height: int) -> Image.Image:
    ratio = im.width / im.height
    if abs(ratio - width / height) > 0.02:
        if ratio > width / height:
            nw = int(im.height * width / height)
            left = (im.width - nw) // 2
            im = im.crop((left, 0, left + nw, im.height))
        else:
            nh = int(im.width * height / width)
            top = int((im.height - nh) * 0.35)
            im = im.crop((0, top, im.width, top + nh))
    return im.resize((width, height), Image.LANCZOS)


def _save(path: Path, im: Image.Image) -> Path:
    im.save(path)
    return path

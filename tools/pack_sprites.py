#!/usr/bin/env python3
"""Assemble les exports PixelLab en planches de sprites pour Phaser.

Entrée  : art-sources/pixellab/heroine-run.zip  (course 8 directions, 6 images)
          art-sources/pixellab/heroine-bow.zip  (poses fixes à l'arc, 8 directions)
Sortie  : public/sprites/heroine-{run,bow}-{full,half}.png + heroine-meta.json

Lancer : python3 tools/pack_sprites.py
Les deux planches partagent le même cadrage : les pieds restent au même endroit
d'une planche à l'autre.
"""
import io, json, zipfile
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-sources" / "pixellab"
OUT = ROOT / "public" / "sprites"
# Ordre des lignes = secteurs de 45° dans le sens horaire, en partant de la droite de l'écran.
DIRS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"]
RUN_FRAMES = 6


def read_png(zf, name):
    return Image.open(io.BytesIO(zf.read(name))).convert("RGBA")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    zrun = zipfile.ZipFile(SRC / "heroine-run.zip")
    zbow = zipfile.ZipFile(SRC / "heroine-bow.zip")

    run = {d: [read_png(zrun, f"Idle/animations/Running/{d}/frame_{i:03d}.png") for i in range(RUN_FRAMES)] for d in DIRS}
    bow = {d: read_png(zbow, f"holding_a_futuristic/rotations/{d}.png") for d in DIRS}

    # Cadrage commun : union de toutes les zones non transparentes.
    boxes = [im.getbbox() for frames in run.values() for im in frames] + [im.getbbox() for im in bow.values()]
    x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
    pad = 2
    crop = (max(0, x0 - pad), max(0, y0 - pad), min(256, x1 + pad), min(256, y1 + pad))
    fw, fh = crop[2] - crop[0], crop[3] - crop[1]
    if fw % 2: fw += 1
    if fh % 2: fh += 1
    crop = (crop[0], crop[1], crop[0] + fw, crop[1] + fh)
    print("cadrage", crop, "image", fw, "x", fh)

    meta = {"source_canvas": 256, "crop": crop, "dirs": DIRS, "run_frames": RUN_FRAMES, "variants": {}}
    for label, scale in (("full", 1.0), ("half", 0.5)):
        w, h = int(fw * scale), int(fh * scale)

        def prep(im):
            im = im.crop(crop)
            return im if scale == 1.0 else im.resize((w, h), Image.LANCZOS)

        run_sheet = Image.new("RGBA", (w * RUN_FRAMES, h * len(DIRS)))
        for r, d in enumerate(DIRS):
            for c, im in enumerate(run[d]):
                run_sheet.paste(prep(im), (c * w, r * h))
        bow_sheet = Image.new("RGBA", (w * len(DIRS), h))
        for c, d in enumerate(DIRS):
            bow_sheet.paste(prep(bow[d]), (c * w, 0))
        run_sheet.save(OUT / f"heroine-run-{label}.png", optimize=True)
        bow_sheet.save(OUT / f"heroine-bow-{label}.png", optimize=True)
        meta["variants"][label] = {
            "frame_w": w, "frame_h": h,
            "run_sheet": [run_sheet.width, run_sheet.height],
            "bow_sheet": [bow_sheet.width, bow_sheet.height],
            "gpu_bytes": (run_sheet.width * run_sheet.height + bow_sheet.width * bow_sheet.height) * 4,
        }
        for n in (f"heroine-run-{label}.png", f"heroine-bow-{label}.png"):
            print(n, (OUT / n).stat().st_size // 1024, "Ko")
    (OUT / "heroine-meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta["variants"], indent=2))


if __name__ == "__main__":
    main()

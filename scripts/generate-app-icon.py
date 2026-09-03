"""Render assets/request.ico from the REduQuest mark.

The historical icon was a single 128x128 frame quantised to a 16 colour
palette, which electron-builder rejects (`Icon must be at least 256x256`).
This script redraws the same mark - cyan hexagon plus signal wave - as
vector geometry, supersamples it, and writes a multi-resolution ICO.

Usage: python scripts/generate-app-icon.py
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "assets" / "request.ico"
SIZES = [16, 24, 32, 48, 64, 128, 256]

BASE = 128.0          # coordinate space the mark was designed in
SUPER = 4096          # supersampled canvas
SCALE = SUPER / BASE

BACKGROUND = (0, 0, 0, 255)
ACCENT = (0, 255, 255, 255)

HEX_CENTER = (64.0, 61.0)
HEX_RADIUS = 50.8
HEX_STROKE = 6.5
WAVE_STROKE = 5.2

# Centreline of the signal wave, traced from the original artwork.
WAVE = [
    (32.5, 67.4), (35.0, 64.0), (38.0, 60.0), (41.0, 58.1), (43.0, 58.0),
    (46.0, 59.5), (49.0, 62.0), (52.0, 65.5), (55.0, 68.5), (58.0, 70.5),
    (60.5, 71.0), (63.0, 70.0), (66.0, 66.0), (69.0, 60.5), (72.0, 55.5),
    (75.0, 52.5), (77.5, 52.0), (80.0, 53.0), (83.0, 55.5), (86.0, 58.0),
    (89.0, 60.5), (91.0, 62.2), (92.3, 62.4), (93.6, 61.4), (95.0, 59.5),
]


def hexagon():
    cx, cy = HEX_CENTER
    return [
        (cx + HEX_RADIUS * math.cos(math.radians(a)),
         cy - HEX_RADIUS * math.sin(math.radians(a)))
        for a in (90, 30, -30, -90, -150, 150)
    ]


def catmull_rom(points, steps=24):
    """Smooth the traced polyline so the wave keeps its hand-drawn flow."""
    pts = [points[0]] + list(points) + [points[-1]]
    out = []
    for i in range(len(pts) - 3):
        p0, p1, p2, p3 = pts[i:i + 4]
        for s in range(steps):
            t = s / steps
            t2, t3 = t * t, t * t * t
            out.append((
                0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t
                       + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                       + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t
                       + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                       + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
            ))
    out.append(points[-1])
    return out


def stroke(draw, points, width, closed=False):
    """Round-joined polyline: Pillow's joint="curve" only rounds inner joins."""
    path = list(points) + ([points[0]] if closed else [])
    scaled = [(x * SCALE, y * SCALE) for x, y in path]
    w = width * SCALE
    draw.line(scaled, fill=ACCENT, width=int(round(w)))
    r = w / 2.0
    for x, y in scaled:
        draw.ellipse((x - r, y - r, x + r, y + r), fill=ACCENT)


def main():
    canvas = Image.new("RGBA", (SUPER, SUPER), BACKGROUND)
    draw = ImageDraw.Draw(canvas)

    stroke(draw, hexagon(), HEX_STROKE, closed=True)
    stroke(draw, catmull_rom(WAVE), WAVE_STROKE)

    frames = [canvas.resize((s, s), Image.LANCZOS) for s in SIZES]
    frames[-1].save(TARGET, format="ICO", sizes=[(s, s) for s in SIZES],
                    append_images=frames[:-1])
    print(f"wrote {TARGET.relative_to(ROOT)} with sizes {SIZES}")


if __name__ == "__main__":
    main()

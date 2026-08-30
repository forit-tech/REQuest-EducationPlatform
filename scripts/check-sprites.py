"""Проверка качества спрайтов: мылит или нет.

CSS выводит спрайт высотой до 900 CSS-пикселей (.vn-sprite в src/story/story.css),
на экране с масштабом Windows 150% это 1350 физических пикселей. Если фигура в
файле ниже — браузер растягивает картинку, и герой мылится.

Скрипт считает три вещи:
  1. высоту фигуры в пикселях (по альфа-каналу, без прозрачных полей);
  2. коэффициент растяжения при выводе;
  3. разброс масштаба между эмоциями одного героя.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from PIL import Image

# Консоль Windows по умолчанию не в UTF-8, а отчёт русский.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

NAME = re.compile(r"^([a-z]+)-(neutral|happy|worried|surprised|determined)-v(\d+)\.png$")

# Высота элемента из .vn-sprite и типовой масштаб экрана Windows.
STAGE_HEIGHT = 900
DEVICE_SCALE = 1.5
# Выше этого растяжения картинка заметно мылится.
SHARP_LIMIT = 1.15
# Допустимый разброс масштаба фигуры между эмоциями одного героя.
SPREAD_LIMIT = 1.5


def figure_height(path: Path) -> tuple[int, int]:
    image = Image.open(path).convert("RGBA")
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise RuntimeError(f"В {path.name} нет непрозрачных пикселей")
    return image.height, bounds[3] - bounds[1]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path, nargs="?", default=Path("assets/characters/generated"))
    arguments = parser.parse_args()

    newest: dict[tuple[str, str], tuple[int, Path]] = {}
    for path in sorted(arguments.directory.glob("*.png")):
        match = NAME.match(path.name)
        if not match:
            continue
        key = (match.group(1), match.group(2))
        version = int(match.group(3))
        if key not in newest or version > newest[key][0]:
            newest[key] = (version, path)

    by_character: dict[str, list[tuple[str, int, int]]] = {}
    for (character, emotion), (_, path) in sorted(newest.items()):
        canvas, figure = figure_height(path)
        by_character.setdefault(character, []).append((emotion, canvas, figure))

    if not by_character:
        print("Спрайты не найдены")
        return 1

    blurry: list[str] = []
    jumpy: list[str] = []

    print("Качество спрайтов REduQuest")
    print(f"  сцена выводит {STAGE_HEIGHT} CSS-px, экран x{DEVICE_SCALE} → нужно {round(STAGE_HEIGHT * DEVICE_SCALE)} px фигуры")
    print("")
    print("  герой       поз  фигура px    доля в холсте   растяжение  на экране")
    for character, rows in sorted(by_character.items()):
        shares = [figure / canvas * 100 for _, canvas, figure in rows]
        figures = [figure for _, _, figure in rows]
        rendered = [STAGE_HEIGHT * figure / canvas for _, canvas, figure in rows]
        stretch = STAGE_HEIGHT / (sum(canvas for _, canvas, _ in rows) / len(rows))
        spread = (max(rendered) - min(rendered)) / max(rendered) * 100

        if stretch > SHARP_LIMIT:
            blurry.append(character)
        if spread > SPREAD_LIMIT:
            jumpy.append(f"{character} ({spread:.1f}%)")

        flag = "✕" if stretch > SHARP_LIMIT else "·"
        print(
            f"  {flag} {character:10} {len(rows)}  {min(figures):>4}..{max(figures):<4}"
            f"  {min(shares):>5.1f}..{max(shares):<5.1f}%"
            f"   x{stretch:>4.2f}      x{stretch * DEVICE_SCALE:>4.2f}"
        )

    print("")
    if jumpy:
        print("Герой меняет размер при смене эмоции: " + ", ".join(jumpy))
        print("  Лечится: python scripts/normalize-sprites.py")
    else:
        print("Масштаб фигуры одинаков во всех эмоциях у всех героев.")

    if blurry:
        print("")
        print(f"Мылят при выводе ({len(blurry)}): " + ", ".join(blurry))
        print(f"  Нужна перерисовка в высоком разрешении: фигура от {round(STAGE_HEIGHT * DEVICE_SCALE)} px.")
        print("  Бриф: assets/image-prompts/cast-hi-res-v4-2026-08-29.md")
        return 1

    print("")
    print("Проверка пройдена: ни один спрайт не растягивается при выводе.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

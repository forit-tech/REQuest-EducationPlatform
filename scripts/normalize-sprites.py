"""Привести спрайты героя к единому масштабу внутри холста.

Проблема: спрайты вырезаны по прозрачной границе, поэтому у одного и того же
героя фигура занимает 510..585 px в разных эмоциях. CSS задаёт высоту элемента,
а не высоту фигуры, — герой заметно «прыгает» в размере при смене эмоции.

Решение без потери качества: не масштабируем пиксели, а достраиваем прозрачное
поле так, чтобы доля фигуры в холсте была одинаковой у всех поз. Ноги остаются
прижатыми к нижней кромке, вся слабина уходит наверх.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from PIL import Image

EMOTIONS = ("neutral", "happy", "worried", "surprised", "determined")
NAME = re.compile(r"^([a-z]+)-(neutral|happy|worried|surprised|determined)-v(\d+)\.png$")

# Доля фигуры в холсте. 0.95 повторяет сегодняшний средний кадр, поэтому общий
# размер героя на сцене не меняется — уходит только разнобой между эмоциями.
FIGURE_SHARE = 0.95
# Как делится прозрачная слабина: почти всё сверху, тонкая полоса под подошвами.
BOTTOM_SHARE = 0.22


def latest_versions(directory: Path) -> dict[tuple[str, str], Path]:
    """Для каждой пары герой-эмоция берём файл самой свежей версии."""
    newest: dict[tuple[str, str], tuple[int, Path]] = {}
    for path in sorted(directory.glob("*.png")):
        match = NAME.match(path.name)
        if not match:
            continue
        character, emotion, version = match.group(1), match.group(2), int(match.group(3))
        key = (character, emotion)
        if key not in newest or version > newest[key][0]:
            newest[key] = (version, path)
    return {key: path for key, (_, path) in newest.items()}


def normalize(path: Path) -> tuple[int, int]:
    image = Image.open(path).convert("RGBA")
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise RuntimeError(f"В {path.name} нет непрозрачных пикселей")

    figure = image.crop(bounds)
    canvas_height = round(figure.height / FIGURE_SHARE)
    slack = canvas_height - figure.height
    bottom = round(slack * BOTTOM_SHARE)

    canvas = Image.new("RGBA", (figure.width, canvas_height), (0, 0, 0, 0))
    canvas.paste(figure, (0, canvas_height - figure.height - bottom))
    canvas.save(path)
    return image.height, canvas_height


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path, nargs="?", default=Path("assets/characters/generated"))
    parser.add_argument("--character", action="append", help="ограничить обработку героем")
    arguments = parser.parse_args()

    files = latest_versions(arguments.directory)
    if arguments.character:
        allowed = set(arguments.character)
        files = {key: path for key, path in files.items() if key[0] in allowed}

    by_character: dict[str, list[tuple[str, int, int]]] = {}
    for (character, emotion), path in sorted(files.items()):
        before, after = normalize(path)
        by_character.setdefault(character, []).append((emotion, before, after))

    for character, rows in sorted(by_character.items()):
        missing = [emotion for emotion in EMOTIONS if emotion not in {row[0] for row in rows}]
        note = f"  нет поз: {', '.join(missing)}" if missing else ""
        print(f"{character:10} поз: {len(rows)}  холст {min(r[2] for r in rows)}..{max(r[2] for r in rows)}{note}")


if __name__ == "__main__":
    main()

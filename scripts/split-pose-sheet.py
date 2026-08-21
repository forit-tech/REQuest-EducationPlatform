"""Split a 2x2 transparent pose sheet into tightly cropped character sprites."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


POSES = ("happy", "surprised", "worried", "determined")


def remove_sheet_fragments(image: Image.Image, target: tuple[float, float]) -> Image.Image:
    """Drop small pieces leaking in from a neighbouring sheet quadrant."""
    pixels = np.array(image)
    mask = pixels[:, :, 3] > 8
    labels, count = ndimage.label(mask)
    if count <= 1:
        return image

    sizes = np.bincount(labels.ravel())
    centers = ndimage.center_of_mass(mask, labels, range(1, count + 1))
    # Выбираем крупную компоненту, расположенную ближе всего к центру своей
    # четверти. Так нахлёст возвращает макушку, но не тащит голову соседней позы.
    tx, ty = target
    candidates = []
    for label_id, ((cy, cx), size) in enumerate(zip(centers, sizes[1:], strict=True), start=1):
        if size < 500:
            continue
        distance = ((cx - tx) ** 2 + (cy - ty) ** 2) ** 0.5
        candidates.append((distance / max(size ** 0.35, 1), label_id))
    chosen = min(candidates)[1] if candidates else int(np.argmax(sizes[1:]) + 1)
    keep = np.zeros(count + 1, dtype=bool)
    keep[chosen] = True
    pixels[:, :, 3] = np.where(keep[labels], pixels[:, :, 3], 0)
    return Image.fromarray(pixels, "RGBA")


def split_sheet(source: Path, output_dir: Path, character: str) -> None:
    sheet = Image.open(source).convert("RGBA")
    half_width = sheet.width // 2
    half_height = sheet.height // 2
    # Генератор иногда ставит макушку нижнего ряда на несколько пикселей выше
    # геометрической середины листа. Берём зоны с нахлёстом: последующая очистка
    # компонент уберёт фрагменты соседней позы, зато голова героя не обрежется.
    overlap = max(48, int(min(sheet.width, sheet.height) * 0.045))
    boxes = (
        ((0, 0, half_width + overlap, half_height + overlap), (sheet.width / 4, sheet.height / 4)),
        ((half_width - overlap, 0, sheet.width, half_height + overlap), (sheet.width * 3 / 4 - (half_width - overlap), sheet.height / 4)),
        ((0, half_height - overlap, half_width + overlap, sheet.height), (sheet.width / 4, sheet.height * 3 / 4 - (half_height - overlap))),
        ((half_width - overlap, half_height - overlap, sheet.width, sheet.height), (sheet.width * 3 / 4 - (half_width - overlap), sheet.height * 3 / 4 - (half_height - overlap))),
    )

    output_dir.mkdir(parents=True, exist_ok=True)
    for pose, (box, target) in zip(POSES, boxes, strict=True):
        image = remove_sheet_fragments(sheet.crop(box), target)
        alpha_bounds = image.getchannel("A").getbbox()
        if alpha_bounds is None:
            raise RuntimeError(f"No visible pixels in {character}:{pose}")

        left, top, right, bottom = alpha_bounds
        padding = 24
        crop_box = (
            max(0, left - padding),
            max(0, top - padding),
            min(image.width, right + padding),
            min(image.height, bottom + padding),
        )
        image.crop(crop_box).save(output_dir / f"{character}-{pose}-v3.png")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("character")
    args = parser.parse_args()
    split_sheet(args.source, args.output_dir, args.character)


if __name__ == "__main__":
    main()

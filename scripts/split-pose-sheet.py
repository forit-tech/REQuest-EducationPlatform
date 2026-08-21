"""Split a 2x2 transparent pose sheet into tightly cropped character sprites."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


POSES = ("happy", "surprised", "worried", "determined")


def remove_sheet_fragments(image: Image.Image) -> Image.Image:
    """Drop small pieces leaking in from a neighbouring sheet quadrant."""
    pixels = np.array(image)
    mask = pixels[:, :, 3] > 8
    labels, count = ndimage.label(mask)
    if count <= 1:
        return image

    sizes = np.bincount(labels.ravel())
    largest = sizes[1:].max(initial=0)
    keep = np.zeros(count + 1, dtype=bool)
    keep[1:] = sizes[1:] >= max(500, int(largest * 0.08))
    pixels[:, :, 3] = np.where(keep[labels], pixels[:, :, 3], 0)
    return Image.fromarray(pixels, "RGBA")


def split_sheet(source: Path, output_dir: Path, character: str) -> None:
    sheet = Image.open(source).convert("RGBA")
    half_width = sheet.width // 2
    half_height = sheet.height // 2
    boxes = (
        (0, 0, half_width, half_height),
        (half_width, 0, sheet.width, half_height),
        (0, half_height, half_width, sheet.height),
        (half_width, half_height, sheet.width, sheet.height),
    )

    output_dir.mkdir(parents=True, exist_ok=True)
    for pose, box in zip(POSES, boxes, strict=True):
        image = remove_sheet_fragments(sheet.crop(box))
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

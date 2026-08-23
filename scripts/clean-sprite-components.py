"""Remove detached neighbouring-pose fragments from extracted transparent sprites."""

from pathlib import Path
import sys

from PIL import Image
import numpy as np
from scipy import ndimage


def clean(path: Path) -> None:
    image = Image.open(path).convert("RGBA")
    pixels = np.array(image)
    opaque = pixels[:, :, 3] > 12
    labels, count = ndimage.label(opaque, structure=np.ones((3, 3), dtype=np.uint8))
    if count < 2:
        return
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    keep_label = int(sizes.argmax())
    keep = ndimage.binary_dilation(labels == keep_label, iterations=3)
    removed = int(np.count_nonzero(pixels[:, :, 3][~keep]))
    pixels[:, :, 3][~keep] = 0
    Image.fromarray(pixels, "RGBA").save(path)
    print(f"{path.name}: removed {removed} detached pixels")


if __name__ == "__main__":
    for argument in sys.argv[1:]:
        clean(Path(argument))

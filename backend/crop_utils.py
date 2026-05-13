"""SAM3-compatible crop utilities.

`crop_for_sam3`: produces a fixed-size square crop centred on a click point.
The crop slides to stay within image bounds — no padding, no size reduction
(as long as the image is at least `target` pixels in each dimension).
"""
from __future__ import annotations

import numpy as np
from PIL import Image

SAM3_INPUT_SIZE = 1008


def crop_for_sam3(
    image: "np.ndarray | Image.Image",
    cx: int,
    cy: int,
    target: int = SAM3_INPUT_SIZE,
) -> "tuple[np.ndarray, tuple[int, int], tuple[int, int, int, int]]":
    """Extract a fixed-size square crop centred on a click point.

    Returns:
        crop: (S, S, C) numpy array
        local_point: (lx, ly) position of the click within the crop
        bbox: (x_min, y_min, x_max, y_max) in original image coordinates
    """
    if isinstance(image, Image.Image):
        image = np.array(image)
    H, W = image.shape[:2]

    cx = int(cx)
    cy = int(cy)
    if not (0 <= cx < W and 0 <= cy < H):
        raise ValueError(f"Click ({cx}, {cy}) is outside image bounds ({W}×{H})")

    S    = min(target, W, H)
    half = S // 2

    x_min = cx - half
    y_min = cy - half
    x_max = x_min + S
    y_max = y_min + S

    if x_min < 0:
        x_min, x_max = 0, S
    if x_max > W:
        x_max, x_min = W, W - S
    if y_min < 0:
        y_min, y_max = 0, S
    if y_max > H:
        y_max, y_min = H, H - S

    crop        = image[y_min:y_max, x_min:x_max]
    local_point = (cx - x_min, cy - y_min)
    bbox        = (x_min, y_min, x_max, y_max)
    return crop, local_point, bbox

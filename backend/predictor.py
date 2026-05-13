from __future__ import annotations
import base64
import io

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

from crop_utils import crop_for_sam3

if torch.cuda.is_available():
    DEVICE = torch.device("cuda")
elif torch.backends.mps.is_available():
    DEVICE = torch.device("mps")
else:
    DEVICE = torch.device("cpu")

_tracker_sa        = None
_tracker_processor = None
_loaded_checkpoint = None


def load_model(checkpoint: str = "facebook/sam3"):
    global _tracker_sa, _tracker_processor, _loaded_checkpoint
    if _loaded_checkpoint == checkpoint and _tracker_sa is not None:
        return
    dtype = torch.float16 if DEVICE.type in ("cuda", "mps") else torch.float32
    print(f"Loading SAM3 ({checkpoint}) on {DEVICE} [{dtype}]…")
    from transformers import Sam3TrackerModel, Sam3TrackerProcessor
    _tracker_processor = Sam3TrackerProcessor.from_pretrained(checkpoint, local_files_only=True)
    _tracker_sa = (
        Sam3TrackerModel.from_pretrained(checkpoint, local_files_only=True, dtype=dtype)
        .to(DEVICE)
        .eval()
    )
    _loaded_checkpoint = checkpoint
    print("SAM3 ready ✓")


def predict_mask(image_path: str, points: list[dict]) -> dict:
    """
    points: [{"x": 100, "y": 200, "label": 1}, ...]
    Returns: {"mask_b64": "...", "iou_score": 0.94, "bbox": [x, y, w, h]}
    """
    img_pil         = Image.open(image_path).convert("RGB")
    W_orig, H_orig  = img_pil.size
    pts             = [(int(p["x"]), int(p["y"]), int(p["label"])) for p in points]
    cx0, cy0, _     = pts[0]

    crop_arr, _, (x_min, y_min, x_max, y_max) = crop_for_sam3(img_pil, cx0, cy0)
    crop_h, crop_w  = crop_arr.shape[:2]
    crop_pil        = Image.fromarray(crop_arr)

    local_pts: list[list[float]] = []
    local_lbls: list[int]        = []
    for x, y, lbl in pts:
        lx, ly = x - x_min, y - y_min
        if 0 <= lx < crop_w and 0 <= ly < crop_h:
            local_pts.append([float(lx), float(ly)])
            local_lbls.append(int(lbl))

    if not local_pts:
        raise ValueError("All points are outside the crop region.")

    inputs = _tracker_processor(
        images=crop_pil,
        input_points=[[local_pts]],
        input_labels=[[local_lbls]],
        return_tensors="pt",
    )

    cast = lambda t: t.to(dtype=_tracker_sa.dtype, device=DEVICE)
    with torch.no_grad():
        out = _tracker_sa(
            pixel_values=cast(inputs["pixel_values"]),
            input_points=cast(inputs["input_points"]),
            input_labels=inputs["input_labels"].to(DEVICE),
            multimask_output=True,
        )

    # out.pred_masks: (1, 1, 3, 256, 256) low-res logits
    iou_scores = out.iou_scores[0, 0].float().cpu()   # (3,)
    pred_masks = out.pred_masks[0, 0].float().cpu()   # (3, 256, 256)
    best_idx   = int(iou_scores.argmax().item())
    score      = float(iou_scores[best_idx].item())
    raw        = pred_masks[best_idx]

    mask_crop = (
        F.interpolate(
            raw.unsqueeze(0).unsqueeze(0),
            size=(crop_h, crop_w),
            mode="bilinear",
            align_corners=False,
        )
        .squeeze()
        .sigmoid()
        .numpy()
        > 0.5
    )

    full_mask = np.zeros((H_orig, W_orig), dtype=np.uint8)
    full_mask[y_min:y_max, x_min:x_max] = mask_crop.astype(np.uint8) * 255

    buf = io.BytesIO()
    Image.fromarray(full_mask).save(buf, format="PNG")
    mask_b64 = base64.b64encode(buf.getvalue()).decode()

    # Bounding box from mask
    cols = np.any(full_mask, axis=0)
    rows = np.any(full_mask, axis=1)
    if cols.any():
        x1 = int(np.where(cols)[0][0])
        x2 = int(np.where(cols)[0][-1])
        y1 = int(np.where(rows)[0][0])
        y2 = int(np.where(rows)[0][-1])
        bbox = [x1, y1, x2 - x1, y2 - y1]
    else:
        bbox = [0, 0, 0, 0]

    return {"mask_b64": mask_b64, "iou_score": score, "bbox": bbox}

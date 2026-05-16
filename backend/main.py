from __future__ import annotations
import base64
import csv
import io
import json as _json
import json
import math
from contextlib import asynccontextmanager
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel

import predictor
from coco_manager import CocoManager
from config_manager import load_config, save_config

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp"}
FRONTEND_DIST    = Path(__file__).parent.parent / "frontend" / "dist"



def migrate_if_needed(dataset_dir: str):
    """Migrate legacy single-file annotations.json to the per-image _annotations/ layout."""
    old = Path(dataset_dir) / "annotations.json"
    new = Path(dataset_dir) / "_annotations"
    if not old.exists() or new.exists():
        return
    try:
        data       = json.loads(old.read_text())
        manager    = CocoManager(dataset_dir)
        id_to_file = {img["id"]: img["file_name"] for img in data.get("images", [])}
        cat_map    = {c["id"]: c["name"]           for c  in data.get("categories", [])}
        img_sizes  = {img["file_name"]: (img.get("width", 0), img.get("height", 0))
                      for img in data.get("images", [])}
        for ann in data.get("annotations", []):
            fname = id_to_file.get(ann["image_id"], "")
            if not fname:
                continue
            W, H = img_sizes.get(fname, (0, 0))
            cls  = cat_map.get(ann["category_id"], "unknown")
            manager.add_annotation(fname, W, H, cls,
                                   ann["segmentation"], ann["bbox"], ann["area"])
        old.rename(old.with_suffix(".json.bak"))
        print(f"[migrate] annotations.json → _annotations/ ({len(data.get('annotations',[]))} annotations)")
    except Exception as e:
        print(f"[migrate] error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg        = load_config()
    dataset_dir = cfg.get("dataset_dir", "")
    if dataset_dir:
        migrate_if_needed(dataset_dir)
    checkpoint = cfg.get("sam3_checkpoint", "facebook/sam3")
    try:
        predictor.load_model(checkpoint)
    except Exception as e:
        print(f"[warning] Failed to load model: {e}")
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic models ───────────────────────────────────────────────────────────

class ConfigIn(BaseModel):
    dataset_dir:      str
    sam3_checkpoint:  str
    classes:          list = []


class PointIn(BaseModel):
    x:     float
    y:     float
    label: int


class PredictIn(BaseModel):
    image_path: str
    points:     list[PointIn]


class SaveIn(BaseModel):
    image_path: str
    mask_b64:   str
    class_name: str


class CsvBatchItem(BaseModel):
    points:     list[float]
    shape_name: str


class SaveCsvBatchIn(BaseModel):
    image_path: str
    class_name: str
    items:      list[CsvBatchItem]


class AutoAnnotateIn(BaseModel):
    image_path: str
    class_name: str
    points:     list[dict]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/config")
def get_config():
    return load_config()


def _classes_from_csv(dataset_dir: str) -> list[dict]:
    """Extract unique label_name values from a Biigle CSV report and return as classes list."""
    d = Path(dataset_dir)
    csv_files = list(d.glob("*_biigle_report.csv")) or list(d.parent.glob("*_biigle_report.csv"))
    if not csv_files:
        return []
    labels: list[str] = []
    seen: set[str] = set()
    with open(csv_files[0], newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = row.get("label_name", "").strip()
            if name and name not in seen:
                seen.add(name)
                labels.append(name)
    return [
        {"name": name, "color": f"hsl({(i * 137) % 360},65%,55%)"}
        for i, name in enumerate(sorted(labels))
    ]


@app.post("/config")
def post_config(body: ConfigIn):
    existing = load_config()
    cfg = body.model_dump()
    dataset_changed = cfg["dataset_dir"] != existing.get("dataset_dir", "")
    existing_classes = existing.get("classes", [])
    if existing_classes and not dataset_changed:
        cfg["classes"] = existing_classes
    else:
        csv_classes = _classes_from_csv(cfg["dataset_dir"])
        cfg["classes"] = csv_classes if csv_classes else existing_classes
    save_config(cfg)
    migrate_if_needed(cfg["dataset_dir"])
    predictor.load_model(cfg["sam3_checkpoint"])
    return {"ok": True}


@app.get("/images")
def list_images():
    cfg = load_config()
    d   = Path(cfg.get("dataset_dir", ""))
    if not d.is_dir():
        return []
    return sorted(
        f.name for f in d.iterdir()
        if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS
    )


@app.get("/image/{filename}")
def get_image(filename: str):
    cfg  = load_config()
    path = Path(cfg["dataset_dir"]) / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(404, "Image not found")
    return FileResponse(str(path))


@app.post("/predict")
def predict(body: PredictIn):
    if predictor._tracker_sa is None:
        raise HTTPException(503, "Model not loaded")
    try:
        result = predictor.predict_mask(
            body.image_path,
            [p.model_dump() for p in body.points],
        )
    except Exception as e:
        raise HTTPException(500, str(e))
    return result


@app.post("/save")
def save_annotation(body: SaveIn):
    cfg         = load_config()
    dataset_dir = cfg.get("dataset_dir", "")

    mask_bytes = base64.b64decode(body.mask_b64)
    mask_img   = Image.open(io.BytesIO(mask_bytes)).convert("L")
    W, H       = mask_img.size
    binary     = (np.array(mask_img) > 128).astype(np.uint8)

    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    segmentation = [c.flatten().tolist() for c in contours if len(c) >= 3]
    if not segmentation:
        raise HTTPException(400, "No valid contours found")

    all_pts      = np.concatenate([c.reshape(-1, 2) for c in contours])
    x, y, bw, bh = cv2.boundingRect(all_pts.reshape(-1, 1, 2))
    area         = float(binary.sum())

    manager = CocoManager(dataset_dir)
    filename = Path(body.image_path).name
    ann_id   = manager.add_annotation(filename, W, H, body.class_name, segmentation, [x, y, bw, bh], area)
    return {"annotation_id": ann_id}


@app.post("/save-csv-batch")
def save_csv_batch(body: SaveCsvBatchIn):
    cfg         = load_config()
    dataset_dir = cfg.get("dataset_dir", "")
    manager     = CocoManager(dataset_dir)
    filename    = Path(body.image_path).name
    with Image.open(body.image_path) as im:
        W, H = im.size

    if not body.items:
        return {"annotation_ids": []}
    ids = []
    for item in body.items:
        pts = item.points
        if item.shape_name == "Point":
            cx, cy = pts[0], pts[1]
            r = 8
            n = 16
            circle_pts = []
            for k in range(n):
                angle = 2 * math.pi * k / n
                circle_pts.extend([cx + r * math.cos(angle), cy + r * math.sin(angle)])
            seg  = [circle_pts]
            area = math.pi * r * r
            bbox = [int(cx - r), int(cy - r), r * 2, r * 2]
        else:
            seg      = [pts]
            pts_arr  = np.array(pts).reshape(-1, 2)
            x0, y0   = float(pts_arr[:, 0].min()), float(pts_arr[:, 1].min())
            x1, y1   = float(pts_arr[:, 0].max()), float(pts_arr[:, 1].max())
            bbox     = [int(x0), int(y0), int(x1 - x0), int(y1 - y0)]
            n        = len(pts_arr)
            area     = abs(sum(
                pts_arr[i, 0] * pts_arr[(i + 1) % n, 1] -
                pts_arr[(i + 1) % n, 0] * pts_arr[i, 1]
                for i in range(n)
            )) / 2
        ann_id = manager.add_annotation(filename, W, H, body.class_name, seg, bbox, float(area))
        ids.append(ann_id)
    return {"annotation_ids": ids}


@app.get("/annotations/{filename}")
def get_annotations(filename: str):
    cfg     = load_config()
    manager = CocoManager(cfg.get("dataset_dir", ""))
    return manager.get_annotations_for_image(filename)


@app.delete("/annotation/{ann_id}")
def delete_annotation(ann_id: int):
    cfg     = load_config()
    manager = CocoManager(cfg.get("dataset_dir", ""))
    manager.delete_annotation(ann_id)
    return {"ok": True}


@app.get("/browse")
def browse(path: str = "/"):
    p = Path(path)
    if not p.exists() or not p.is_dir():
        raise HTTPException(400, "Invalid directory")
    items = []
    try:
        for item in sorted(p.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
            if item.name.startswith("."):
                continue
            try:
                is_dir   = item.is_dir()
                img_count = 0
                if is_dir:
                    img_count = sum(
                        1 for f in item.iterdir()
                        if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS
                    )
                items.append({"name": item.name, "path": str(item), "is_dir": is_dir, "img_count": img_count})
            except PermissionError:
                pass
    except PermissionError:
        pass
    parent = str(p.parent) if p != p.parent else None
    return {"path": str(p), "parent": parent, "items": items}


@app.get("/annotation-counts")
def annotation_counts():
    cfg = load_config()
    return CocoManager(cfg.get("dataset_dir", "")).get_annotation_counts()


@app.get("/csv-annotations/{filename}")
def get_csv_annotations(filename: str):
    cfg = load_config()
    dataset_dir = Path(cfg.get("dataset_dir", ""))
    csv_files = list(dataset_dir.glob("*_biigle_report.csv")) or \
                list(dataset_dir.parent.glob("*_biigle_report.csv"))
    if not csv_files:
        return []
    results = []
    with open(csv_files[0], newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("filename") != filename:
                continue
            try:
                pts = _json.loads(row["points"])
            except Exception:
                continue
            results.append({
                "label_name": row.get("label_name", ""),
                "shape_name": row.get("shape_name", ""),
                "points":     pts,
            })
    return results


@app.post("/auto-annotate-points")
def auto_annotate_points(body: AutoAnnotateIn):
    if predictor._tracker_sa is None:
        raise HTTPException(503, "Model not loaded")
    cfg      = load_config()
    manager  = CocoManager(cfg.get("dataset_dir", ""))
    filename = Path(body.image_path).name
    with Image.open(body.image_path) as im:
        W, H = im.size

    saved_ids: list[int] = []
    failed = 0
    for pt in body.points:
        try:
            result     = predictor.predict_mask(body.image_path, [{"x": pt["x"], "y": pt["y"], "label": 1}])
            mask_bytes = base64.b64decode(result["mask_b64"])
            mask_img   = Image.open(io.BytesIO(mask_bytes)).convert("L")
            binary     = (np.array(mask_img) > 128).astype(np.uint8)
            contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            segmentation = [c.flatten().tolist() for c in contours if len(c) >= 3]
            if not segmentation:
                failed += 1
                continue
            all_pts      = np.concatenate([c.reshape(-1, 2) for c in contours])
            x, y, bw, bh = cv2.boundingRect(all_pts.reshape(-1, 1, 2))
            area         = float(binary.sum())
            ann_id = manager.add_annotation(filename, W, H, body.class_name, segmentation, [x, y, bw, bh], area)
            saved_ids.append(ann_id)
        except Exception as e:
            failed += 1
            print(f"[auto-annotate] {e}")

    return {"saved": len(saved_ids), "failed": failed, "annotation_ids": saved_ids}


@app.get("/export")
def export():
    cfg     = load_config()
    manager = CocoManager(cfg.get("dataset_dir", ""))
    return manager.get_all()


# Serve frontend static files — must be mounted AFTER all API routes
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")

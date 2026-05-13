from __future__ import annotations
import json
from pathlib import Path


class CocoManager:
    def __init__(self, dataset_dir: str):
        self.ann_dir = Path(dataset_dir) / "_annotations"
        self.ann_dir.mkdir(exist_ok=True)

    # ── Metadata helpers ──────────────────────────────────────────────────────

    def _next_id(self) -> int:
        p = self.ann_dir / "_next_id"
        val = int(p.read_text().strip()) if p.exists() else 0
        val += 1
        p.write_text(str(val))
        return val

    def _load_counts(self) -> dict:
        p = self.ann_dir / "_counts.json"
        return json.loads(p.read_text()) if p.exists() else {}

    def _save_counts(self, d: dict):
        (self.ann_dir / "_counts.json").write_text(json.dumps(d))

    def _load_id_map(self) -> dict:
        p = self.ann_dir / "_id_map.json"
        return json.loads(p.read_text()) if p.exists() else {}

    def _save_id_map(self, d: dict):
        (self.ann_dir / "_id_map.json").write_text(json.dumps(d))

    def _img_path(self, filename: str) -> Path:
        return self.ann_dir / (filename + ".json")

    def _load_image_anns(self, filename: str) -> list:
        p = self._img_path(filename)
        return json.loads(p.read_text()) if p.exists() else []

    def _save_image_anns(self, filename: str, anns: list):
        self._img_path(filename).write_text(json.dumps(anns))

    # ── Public API ────────────────────────────────────────────────────────────

    def add_annotation(
        self, filename: str, width: int, height: int,
        class_name: str, segmentation: list, bbox: list, area: float,
    ) -> int:
        ann_id = self._next_id()
        anns   = self._load_image_anns(filename)
        anns.append({
            "id":          ann_id,
            "class_name":  class_name,
            "segmentation": segmentation,
            "bbox":        bbox,
            "area":        float(area),
            "width":       width,
            "height":      height,
        })
        self._save_image_anns(filename, anns)

        counts = self._load_counts()
        counts[filename] = len(anns)
        self._save_counts(counts)

        id_map = self._load_id_map()
        id_map[str(ann_id)] = filename
        self._save_id_map(id_map)

        return ann_id

    def delete_annotation(self, ann_id: int):
        id_map   = self._load_id_map()
        filename = id_map.get(str(ann_id))
        if not filename:
            return
        anns = [a for a in self._load_image_anns(filename) if a["id"] != ann_id]
        self._save_image_anns(filename, anns)

        counts = self._load_counts()
        counts[filename] = len(anns)
        self._save_counts(counts)

        del id_map[str(ann_id)]
        self._save_id_map(id_map)

    def get_annotations_for_image(self, filename: str) -> list:
        return self._load_image_anns(filename)

    def get_annotation_counts(self) -> dict:
        return self._load_counts()

    def get_all(self) -> dict:
        """Merge all per-image files into COCO format (for export)."""
        images, annotations, categories = [], [], []
        cat_map: dict[str, int] = {}
        img_id = cat_id = 1

        for f in sorted(self.ann_dir.glob("*.json")):
            if f.name.startswith("_"):
                continue
            filename = f.name[:-5]  # strip .json suffix
            anns = json.loads(f.read_text())
            if not anns:
                continue
            W = anns[0].get("width", 0)
            H = anns[0].get("height", 0)
            images.append({"id": img_id, "file_name": filename, "width": W, "height": H})
            for ann in anns:
                cls = ann["class_name"]
                if cls not in cat_map:
                    cat_map[cls] = cat_id
                    categories.append({"id": cat_id, "name": cls, "supercategory": ""})
                    cat_id += 1
                annotations.append({
                    "id":           ann["id"],
                    "image_id":     img_id,
                    "category_id":  cat_map[cls],
                    "segmentation": ann["segmentation"],
                    "bbox":         ann["bbox"],
                    "area":         ann["area"],
                    "iscrowd":      0,
                })
            img_id += 1

        return {
            "info":        {"description": "SAM3 Annotations", "version": "1.0"},
            "licenses":    [],
            "images":      images,
            "annotations": annotations,
            "categories":  categories,
        }

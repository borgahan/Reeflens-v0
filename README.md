# SAM3 Annotator

An interactive image annotation tool powered by [SAM3 (Segment Anything Model 3)](https://huggingface.co/facebook/sam3). Click on objects in an image to instantly generate segmentation masks, save them in COCO JSON format, and import existing annotations from Biigle CSV exports.

## Features

- **Point-prompt segmentation** — left-click for positive points, right-click for negative
- **COCO JSON output** — per-image storage with fast annotation counts
- **Biigle CSV import** — visualise and batch-convert Biigle report exports to SAM3 masks
- **Auto-annotate** — run SAM3 on all Point annotations in a Biigle class in one click
- **Select & delete** — canvas select mode, multi-select, Ctrl+A, Delete key
- **Statistics modal** — class distribution, per-image counts, area histogram

## Requirements

| Dependency | Version |
|---|---|
| Python | 3.10 |
| Node.js | 18+ |
| PyTorch | 2.11+ with matching CUDA |
| CUDA | 12+ (NVIDIA GPU required for inference) |
| Conda | any recent version |

> **macOS note:** CUDA is not available on macOS. The backend automatically falls back to MPS (Apple Silicon) or CPU. See the PyTorch install section below for expected performance.

## Installation

### 1. Clone

```bash
git clone https://github.com/colt18/coral-sam3-annotator.git
cd coral-sam3-annotator
```

### 2. Create conda environment

```bash
conda env create -f environment.yml
conda activate sam3annotator
```

This installs Python 3.10, `transformers==5.6.2`, FastAPI, OpenCV, and other dependencies.

### 3. Install PyTorch

PyTorch is **not** in `environment.yml` because the right wheel depends on your hardware. Pick the command that matches your system:

```bash
# Linux / Windows — CUDA 13.0 (development setup)
pip install torch --index-url https://download.pytorch.org/whl/cu130

# Linux / Windows — CUDA 12.1 (common alternative)
pip install torch --index-url https://download.pytorch.org/whl/cu121

# macOS — Apple Silicon (MPS acceleration)
pip install torch

# macOS — Intel (CPU only, very slow)
pip install torch
```

See [pytorch.org/get-started/locally](https://pytorch.org/get-started/locally/) for other combinations.

The backend auto-detects the best available device at startup (CUDA → MPS → CPU) and prints it in the console. Inference speed varies significantly:

| Device | Approx. time per mask |
|---|---|
| NVIDIA GPU (CUDA) | ~0.3 s |
| Apple Silicon (MPS) | ~3–8 s |
| CPU | ~30–60 s |

Verify your setup:
```bash
python -c "import torch; print(torch.__version__, 'cuda:', torch.cuda.is_available(), 'mps:', torch.backends.mps.is_available())"
```

### 4. Download the SAM3 model weights

`facebook/sam3` is a **gated model** — you must request access before downloading:

1. Go to [huggingface.co/facebook/sam3](https://huggingface.co/facebook/sam3) and request access
2. Once approved, log in via the CLI:
   ```bash
   huggingface-cli login
   ```
3. Download the weights:
   ```bash
   huggingface-cli download facebook/sam3
   ```

This saves the weights to `~/.cache/huggingface/` (~2–3 GB). The backend uses `local_files_only=True`, so this step must be completed before starting the server — it will not re-download at runtime.

### 5. Frontend dependencies

```bash
cd frontend && npm install && cd ..
```

### 6. Configure

```bash
cp backend/config.example.json backend/config.json
# Edit backend/config.json:
#   dataset_dir      — path to your image folder
#   sam3_checkpoint  — "facebook/sam3" (or a local path)
```

## Configuration

`backend/config.json` (not committed — contains local paths):

```json
{
  "dataset_dir": "/path/to/your/images",
  "sam3_checkpoint": "facebook/sam3",
  "classes": [
    { "name": "coral", "color": "#FF5733" },
    { "name": "sand",  "color": "#33FF57" }
  ]
}
```

`sam3_checkpoint` must point to a locally cached Hugging Face model directory (loaded with `local_files_only=True`).

## Running

```bash
# Activate the environment first, then run:
conda activate sam3annotator
./start.sh

# Or separately:
# Terminal 1 — backend
conda activate sam3annotator
cd backend && uvicorn main:app --host 0.0.0.0 --port 8001

# Terminal 2 — frontend dev server
cd frontend && npm run dev   # → http://localhost:5173
```

The production build is served by the FastAPI backend at `http://localhost:8001`.

## Usage

1. Open `http://localhost:8001` (or `http://localhost:5173` in dev mode)
2. Set the dataset directory on the config screen and click **Start**
3. Select an image from the left panel
4. **SAM3 tab** — left-click to add positive points, right-click for negative, Enter to save
5. **Biigle CSV tab** — browse imported annotations, select a class, convert to masks
6. Use **Actions → Statistics** to see annotation counts and distribution
7. **Actions → Export COCO JSON** to download all annotations

### Keyboard shortcuts

| Key | Action |
|---|---|
| `Enter` | Save active mask / confirm CSV selection |
| `Ctrl+Z` | Undo last point |
| `Delete` | Delete selected annotations |
| `Ctrl+A` | Select all annotations |
| `Shift+click` | Range/multi-select in annotation list |

## Project Structure

```
sam3-annotator/
├── backend/
│   ├── main.py            # FastAPI application + endpoints
│   ├── predictor.py       # SAM3 model loading and inference
│   ├── coco_manager.py    # Per-image COCO JSON storage
│   ├── config_manager.py  # config.json read/write
│   ├── crop_utils.py      # 1008×1008 crop helper for SAM3
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js
│   │   └── components/
│   │       ├── AnnotationCanvas.jsx
│   │       ├── AnnotationPanel.jsx
│   │       ├── ImageList.jsx
│   │       ├── ClassInputModal.jsx
│   │       ├── ConfigScreen.jsx
│   │       ├── CsvAnnotationLayer.jsx
│   │       ├── FileExplorer.jsx
│   │       └── StatsModal.jsx
│   └── vite.config.js
├── start.sh
└── requirements.txt
```

## Annotation Storage

Annotations are stored as per-image JSON files under `{dataset_dir}/_annotations/`:

```
_annotations/
  img001.JPG.json    # annotations for that image
  _counts.json       # {filename: count} index for fast badge display
  _id_map.json       # {ann_id: filename} for fast delete lookup
  _next_id           # global ID counter
```

A legacy `annotations.json` (single-file COCO format) is automatically migrated to this structure on first run.

## API Reference

| Method | Path | Description |
|---|---|---|
| GET | `/config` | Returns current config |
| POST | `/config` | Saves config |
| GET | `/images` | Lists images in dataset directory |
| GET | `/image/{filename}` | Serves an image file |
| POST | `/predict` | Runs SAM3 inference |
| POST | `/save` | Saves a mask as annotation |
| GET | `/annotations/{filename}` | Returns annotations for an image |
| DELETE | `/annotation/{ann_id}` | Deletes an annotation |
| GET | `/annotation-counts` | Returns `{filename: count}` for all images |
| GET | `/csv-annotations/{filename}` | Returns Biigle CSV annotations |
| POST | `/save-csv-batch` | Converts CSV shapes to COCO annotations |
| POST | `/auto-annotate-points` | Batch SAM3 inference from Biigle points |
| GET | `/export` | Returns full COCO JSON for all images |

## License

MIT

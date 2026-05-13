import json
from pathlib import Path

CONFIG_PATH = Path(__file__).parent / "config.json"

DEFAULT_CONFIG = {
    "dataset_dir": "",
    "sam3_checkpoint": "facebook/sam3",
    "classes": [
        {"name": "coral", "color": "#FF5733"},
        {"name": "sand",  "color": "#33FF57"},
    ],
}


def load_config() -> dict:
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH) as f:
            return json.load(f)
    return {k: (v.copy() if isinstance(v, list) else v) for k, v in DEFAULT_CONFIG.items()}


def save_config(config: dict):
    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

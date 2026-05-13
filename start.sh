#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "=== Frontend build ==="
cd "$SCRIPT_DIR/frontend"
npm install --silent
npm run build

echo ""
echo "=== Starting backend ==="
echo "→ http://localhost:8001"
echo ""
cd "$SCRIPT_DIR/backend"
python -m uvicorn main:app --host 0.0.0.0 --port 8001

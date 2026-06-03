#!/bin/bash
echo "⚙️ Starting Neuromail Worker (Native)..."
cd apps/workers
export $(grep -v '^#' ../api/.env | xargs)
uv run python worker.py

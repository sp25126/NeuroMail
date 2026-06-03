#!/bin/bash
echo "📡 Starting Neuromail API (Native)..."
cd apps/api
export $(grep -v '^#' .env | xargs)
uv run uvicorn main:app --host 0.0.0.0 --port 8000

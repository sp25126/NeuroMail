#!/bin/bash
set -e

echo "🚀 Starting Neuromail Native Setup..."

# 1. Check for system dependencies
command -v uv >/dev/null 2>&1 || { echo "❌ 'uv' is not installed. Please install it first: https://github.com/astral-sh/uv"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ 'pnpm' is not installed. Please install it first: https://pnpm.io/"; exit 1; }
command -v psql --version >/dev/null 2>&1 || { echo "⚠️ PostgreSQL not found. Ensure it's installed and running locally."; }
command -v redis-cli ping >/dev/null 2>&1 || { echo "⚠️ Redis not found. Ensure it's installed and running locally."; }

# 2. Install Python dependencies (API & Workers)
echo "📦 Installing Python dependencies..."
cd apps/api && uv sync
cd ../workers && uv sync
cd ../..

# 3. Install Node dependencies (Web & Shared)
echo "📦 Installing Node dependencies..."
pnpm install

# 4. Initialize Database
echo "🗄️ Initializing database..."
cd apps/api && uv run python -c "from database import engine, Base; import models; Base.metadata.create_all(bind=engine)"
cd ../..

echo "✅ Setup complete. You can now use 'scripts/start-*.sh' to launch services."

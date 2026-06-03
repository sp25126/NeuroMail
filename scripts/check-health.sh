#!/bin/bash
echo "🩺 Checking Neuromail System Health..."
API_URL=${API_URL:-"http://localhost:8000"}

echo "--- Backend Health ---"
curl -s "$API_URL/health" | grep -q '"status":"ok"' && echo "✅ API /health OK" || echo "❌ API /health FAIL"
curl -s "$API_URL/ready" | grep -q '"status":"ready"' && echo "✅ API /ready OK" || echo "❌ API /ready FAIL"

echo "--- Frontend Health ---"
curl -s -I "http://localhost:3000" | grep -q "200 OK" && echo "✅ Web Dashboard OK" || echo "⚠️ Web Dashboard not responding (Port 3000)"

echo "--- Services ---"
redis-cli ping | grep -q "PONG" && echo "✅ Redis OK" || echo "❌ Redis FAIL"
pg_isready -h localhost >/dev/null 2>&1 && echo "✅ PostgreSQL OK" || echo "❌ PostgreSQL FAIL"

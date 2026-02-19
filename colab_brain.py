# 🧠 NeuroMail Colab Brain (Single-Cell Version)
# Run this entire script in a single Google Colab cell.
# Make sure "Runtime -> Change runtime type -> T4 GPU" is selected.

import subprocess
import time
import os

# ============================================================
# 1. INSTALL DEPENDENCIES (Run first, before imports)
# ============================================================
print('📦 Installing system dependencies...')
subprocess.run(['apt-get', 'update'], check=True)
subprocess.run(['apt-get', 'install', '-y', 'zstd'], check=True)

print('📦 Installing python dependencies...')
subprocess.run(['pip', 'install', '-q', 'fastapi', 'uvicorn', 'pyngrok', 'nest-asyncio', 'httpx'], check=True)

# Now it is safe to import these
import threading
import nest_asyncio
import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
import uvicorn
from pyngrok import ngrok

# ============================================================
# CONFIGURATION
# ============================================================
MODEL = 'llama3.2:latest'  # Change this if you want a different model
NGROK_AUTH_TOKEN = ''      # <-- PASTE YOUR NGROK TOKEN HERE

# ============================================================
# 2. INSTALL & START OLLAMA
# ============================================================
print('📦 Installing Ollama...')
subprocess.run('curl -fsSL https://ollama.com/install.sh | sh', shell=True)

print('🚀 Starting Ollama server...')
ollama_proc = subprocess.Popen(['ollama', 'serve'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(5)

print(f'📥 Pulling {MODEL}... (this may take a few minutes)')
subprocess.run(['ollama', 'pull', MODEL])
print(f'✅ Model {MODEL} ready!')

# ============================================================
# 3. FASTAPI BRIDGE SERVER
# ============================================================
nest_asyncio.apply()
app = FastAPI(title='NeuroMail Colab Brain')
OLLAMA_URL = 'http://localhost:11434'

@app.get('/health')
async def health():
    return {'status': 'ok', 'model': MODEL, 'gpu': 'T4'}

@app.post('/api/chat')
async def chat(request: Request):
    body = await request.json()
    stream = body.get('stream', False)
    if stream:
        async def generate():
            async with httpx.AsyncClient(timeout=300) as client:
                async with client.stream('POST', f'{OLLAMA_URL}/api/chat', json=body) as response:
                    async for chunk in response.aiter_bytes():
                        yield chunk
        return StreamingResponse(generate(), media_type='application/x-ndjson')
    else:
        async with httpx.AsyncClient(timeout=300) as client:
            response = await client.post(f'{OLLAMA_URL}/api/chat', json=body)
            return JSONResponse(content=response.json(), status_code=response.status_code)

def run_server():
    uvicorn.run(app, host='0.0.0.0', port=8000, log_level='warning')

server_thread = threading.Thread(target=run_server, daemon=True)
server_thread.start()
time.sleep(2)
print('✅ FastAPI bridge server started.')

# ============================================================
# 4. NGROK TUNNEL
# ============================================================
if NGROK_AUTH_TOKEN:
    ngrok.set_auth_token(NGROK_AUTH_TOKEN)

tunnel = ngrok.connect(8000)
public_url = tunnel.public_url

print('\n' + '='*60)
print('🚀 NEUROMAIL COLAB BRAIN IS LIVE!')
print('='*60)
print(f'\n📋 Copy this URL and paste it in NeuroMail Settings:')
print(f'\n   👉  {public_url}  👈')
print(f'\n🤖 Model: {MODEL}')
print(f'⚡ GPU: T4 (Google Colab)')
print('='*60)

# ============================================================
# 5. KEEP ALIVE
# ============================================================
print('\n🔄 Keep-alive running...')
try:
    while True:
        time.sleep(60)
        try:
            r = httpx.get('http://localhost:8000/health', timeout=5)
            print(f'💚 Alive - {time.strftime("%H:%M:%S")} | {r.json()["status"]}')
        except:
            pass
except KeyboardInterrupt:
    print('\n🛑 Stopped.')

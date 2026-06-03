# 🚀 Neuromail Setup Guide

Complete installation and configuration guide for Neuromail.

---

## 📋 Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Google Cloud Setup](#2-google-cloud-setup)
3. [Local Development Setup](#3-local-development-setup)
4. [Environment Variables](#4-environment-variables)
5. [Database Setup](#5-database-setup)
6. [Ollama Configuration](#6-ollama-configuration)
7. [Running the Application](#7-running-the-application)
8. [Troubleshooting](#8-troubleshooting)
9. [Production Deployment](#9-production-deployment)

---

## 1. Prerequisites

### Required Software
```bash
# Node.js (v18 or higher)
node --version  # Should be >= 18.0.0

# npm (comes with Node.js)
npm --version   # Should be >= 9.0.0

# Git
git --version

# Ollama (for local AI)
ollama --version
```

### Installation Instructions
- **Install Node.js**: macOS: `brew install node@18`, Windows: Download from nodejs.org, Linux: `sudo apt install nodejs npm`
- **Install Ollama**: macOS/Linux: `curl -fsSL https://ollama.ai/install.sh | sh`, Windows: Download from ollama.ai

---

## 2. Google Cloud Setup

### Step 1: Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "New Project"
3. Name: `neuromail-dev`
4. Click "Create"

### Step 2: Enable Gmail API
1. Navigate to APIs & Services → Library
2. Search for "Gmail API"
3. Click "Enable"

### Step 3: Create OAuth 2.0 Credentials
1. Go to APIs & Services → Credentials
2. Click "Create Credentials" → "OAuth client ID"
3. Configure consent screen:
    - App name: `Neuromail`
    - User support email: `Your email`
4. Create OAuth client:
    - Application type: `Web application`
    - Name: `Neuromail Web Client`
    - Authorized JavaScript origins: `http://localhost:3000`
    - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
5. Save the **Client ID** and **Client Secret**.

### Step 4: Configure OAuth Consent Screen
1. Add these scopes:
    - `https://www.googleapis.com/auth/gmail.readonly`
    - `https://www.googleapis.com/auth/gmail.send`
    - `https://www.googleapis.com/auth/gmail.modify`
    - `https://www.googleapis.com/auth/userinfo.email`
    - `https://www.googleapis.com/auth/userinfo.profile`
2. Add test users (your Gmail account).
3. Save.

---

## 3. Local Development Setup

### Clone the Repository
```bash
git clone https://github.com/yourusername/neuromail.git
cd neuromail
```

### Install Dependencies
```bash
npm install
```

---

## 4. Environment Variables

### Create Environment File
```bash
cp .env.example .env.local
```

### Edit .env.local
```bash
# GOOGLE OAUTH
GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_here

# NEXTAUTH
NEXTAUTH_SECRET=your_random_secret_here_min_32_chars
NEXTAUTH_URL=http://localhost:3000

# DATABASE
DATABASE_URL=file:./data/neuromail.db

# OLLAMA (Local AI)
OLLAMA_BASE_URL=http://localhost:11434

# APP CONFIGURATION
NODE_ENV=development
```

---

## 5. Database Setup

### Initialize Database
```bash
mkdir -p data
npm run db:init
```

---

## 6. Ollama Configuration

### Pull Required Model
```bash
ollama serve
ollama pull gemma2:2b
```

---

## 7. Running the Monorepo Application

### Monorepo Services Layout
Neuromail is structured as a monorepo containing multiple independent services:
1. **Frontend Dashboard (`apps/web`)**: Next.js dashboard shell running on port `3003`.
2. **API Backend (`apps/api`)**: FastAPI server running on port `8000`.
3. **Background Worker (`apps/workers`)**: Python Redis queue processor.
4. **Shared Types & Constants (`packages/shared`)**: Shared contract schemas.

### Required Infrastructure Services
Before launching, make sure the local dependencies are up and running natively:
- **PostgreSQL**: Ensure PostgreSQL is active on your host system. Database URL should be configured in your env file.
- **Redis**: Background worker queue relies on Redis. Ensure Redis server is active on `redis://localhost:6379`.

### Launching Local Services (Native)
We provide unified scripts in the root directory for a fully native experience (no Docker required):

- **Run all services concurrently**:
  ```bash
  npm run dev
  ```
- **Native Startup Scripts (Linux/macOS)**:
  ```bash
  ./scripts/setup.sh        # One-time setup (deps + db)
  ./scripts/start-api.sh    # Start FastAPI
  ./scripts/start-worker.sh # Start background worker
  ./scripts/start-web.sh    # Start Next.js
  ```

### Production Deployment (Native Stack)
For production on a VPS (Ubuntu/Debian), use the provided `systemd` units:
1. Copy units: `sudo cp systemd/*.service /etc/systemd/system/`
2. Reload: `sudo systemctl daemon-reload`
3. Enable & Start: `sudo systemctl enable --now neuromail-api neuromail-worker neuromail-web`

---

## 8. Troubleshooting
- **Gmail API not enabled**: Double check the Cloud Console.
- **Invalid redirect URI**: Ensure `http://localhost:3000/api/auth/callback/google` is added.
- **Ollama connection refused**: Ensure `ollama serve` is running.
- **Redis Connection Failure**: Verify Redis is running locally (`redis-cli ping` returns `PONG`).

---

## 9. Production Deployment
- **Vercel**: `vercel login` -> `vercel`.
- **Database**: Use Vercel Postgres or Supabase for production.

---

<div align="center">
Happy coding! 🚀

[← Back to README](README.md)
</div>

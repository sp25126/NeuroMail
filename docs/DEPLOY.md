# Deployment Guide: AI Mail App

## ⚠️ Critical Architecture Note
The app is currently configured with **SQLite** (`file:./dev.db`) for rapid local development.
**SQLite does NOT work on Vercel** (Serverless) because the filesystem is ephemeral and reset on each deployment.

### 🚀 Path to Production (Vercel)
To deploy this app to Vercel, you **MUST** switch the database provider back to PostgreSQL.

---

## Step 1: Provision a Cloud Database
We recommend **Supabase** or **Neon** (Free Tier available).

1.  Create a project on [Supabase.com](https://supabase.com).
2.  Get the **Transaction Connection Pooler String** (usually port 6543).
    *   Format: `postgres://[user]:[password]@[host]:6543/[db]?pgbouncer=true`

## Step 2: Update Configuration
1.  **Modify `prisma/schema.prisma`**:
    ```prisma
    datasource db {
      provider = "postgresql"
      url      = env("DATABASE_URL")
    }
    ```
2.  **Delete Local Migrations**:
    *   Remove `prisma/migrations` folder.
    *   Remove `prisma/dev.db`.

## Step 3: Vercel Environment Variables
Add these to your **Vercel Project Settings**:

| Variable | Description | Value |
| :--- | :--- | :--- |
| `DATABASE_URL` | Cloud DB Connection String | `postgres://...` |
| `AUTH_SECRET` | NextAuth Secret | Generate with `openssl rand -base64 32` |
| `AUTH_URL` | Production URL | `https://your-app.vercel.app` |
| `GMAIL_CLIENT_ID` | Google Console | From GCP |
| `GMAIL_CLIENT_SECRET` | Google Console | From GCP |
| `OPENROUTER_API_KEY` | AI Provider | Your Key |
| `NEXT_PUBLIC_APP_URL` | Public URL | `https://your-app.vercel.app` |

## Step 4: Deploy
1.  Push code to GitHub.
2.  Import project into Vercel.
3.  **Build Command:** `npx prisma generate && next build`
4.  **Install Command:** `npm install`

---

## 🚀 Production Deployment (Native)

For production on a standard Linux VPS (Ubuntu/Debian), we use **systemd** to manage service lifecycles and **Nginx** as a reverse proxy.

### 1. Prerequisites
- **Python 3.11+**
- **Node.js 18+ & pnpm**
- **PostgreSQL & Redis**
- **uv** (Python package manager)

### 2. Setup Code
```bash
git clone https://github.com/your-repo/neuromail.git /var/www/neuromail
cd /var/www/neuromail
./scripts/setup.sh
```

### 3. Configure Services
Copy the provided unit files and reload:
```bash
sudo cp systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
```

### 4. Launch
```bash
sudo systemctl enable --now neuromail-api neuromail-worker neuromail-web
```

### 5. Verify
Check logs:
```bash
journalctl -u neuromail-api -f
```
Run health check:
```bash
./scripts/check-health.sh
```

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

## 🛠️ Alternative: Docker Deployment (Self-Hosted)
If you want to keep using **SQLite**, you must deploy using Docker on a VPS (DigitalOcean, Hetzner, EC2) with a persistent volume to store the database file.

**Dockerfile** is ready to go.
1.  `docker build -t neuromail .`
2.  `docker run -v $(pwd)/prisma:/app/prisma -p 3000:3000 neuromail`

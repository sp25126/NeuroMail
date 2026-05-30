# Infrastructure & Observability Specifications

This document outlines the logging, metrics, health check pathways, migrations architecture, and Redis locks implemented for the Neuromail Freight Module.

## 🩺 Health Check & Monitoring Endpoints

### 1. `/health`
- **Method**: `GET`
- **Description**: Verifies container is running and process is active.
- **Response** (`200 OK`):
  ```json
  { "status": "UP", "timestamp": "2026-05-28T09:00:00Z" }
  ```

### 2. `/ready`
- **Method**: `GET`
- **Description**: Evaluates readiness of upstream dependencies (Database connections, Redis availability).
- **Response** (`200 OK` or `503 Service Unavailable`):
  ```json
  {
    "status": "READY",
    "dependencies": {
      "database": "CONNECTED",
      "redis": "CONNECTED"
    }
  }
  ```

### 3. Prometheus Metrics (`/metrics`)
- Exposes metrics for scrape tooling using the Prometheus text exposition format:
  ```text
  # HELP http_requests_total Total number of HTTP requests processed
  # TYPE http_requests_total counter
  http_requests_total{method="GET",route="/api/mail/threads",status="200"} 154

  # HELP worker_runs_total Total scheduled ingestion runs
  # TYPE worker_runs_total counter
  worker_runs_total 12

  # HELP worker_failures_total Total failed scheduled ingestion runs
  # TYPE worker_failures_total counter
  worker_failures_total 0
  ```

---

## 🔒 Redis Distributed Locking API

To prevent multiple instances of the ingestion worker from retrieving emails concurrently, a distributed lock is acquired before processing mailbox queues:

```typescript
import { Redis } from "ioredis";

export class RedisLockManager {
    constructor(private redis: Redis) {}

    async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
        const result = await this.redis.set(
            `lock:${key}`,
            "locked",
            "EX",
            ttlSeconds,
            "NX"
        );
        return result === "OK";
    }

    async releaseLock(key: string): Promise<void> {
        await this.redis.del(`lock:${key}`);
    }
}
```

### Worker Implementation Example:
```typescript
const lockAcquired = await lockManager.acquireLock("ingestion:mailbox-id", 300);
if (!lockAcquired) {
    logger.info("Sync job already running on another worker thread. Skipping execution.");
    return;
}
try {
    await runSync();
} finally {
    await lockManager.releaseLock("ingestion:mailbox-id");
}
```

---

## 🛠️ Database Migrations

Database structure is managed incrementally. Up and Down steps are supported via direct scripts:
- **Run migrations**: `npm run migrate:up` (Applies DDL changes sequentially).
- **Roll back migrations**: `npm run migrate:down` (Rolls back the last applied migration).
- **Status check**: `npm run migrate:status`

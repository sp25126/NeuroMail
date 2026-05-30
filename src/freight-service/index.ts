import { getEnv } from "./config/env";

export interface FreightServiceApp {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  getStatus: () => { status: "ok" | "error"; env: string };
}

export function createFreightService(): FreightServiceApp {
  let isRunning = false;

  return {
    async start() {
      if (isRunning) return;
      const env = getEnv();
      console.log(`[FreightService] Starting in ${env.NODE_ENV} mode...`);
      
      // TODO: Initialize database connection
      // TODO: Initialize Redis if configured
      // TODO: Register routes/workers
      
      isRunning = true;
      console.log(`[FreightService] Started successfully.`);
    },

    async stop() {
      if (!isRunning) return;
      console.log(`[FreightService] Stopping...`);
      
      // TODO: Graceful shutdown of connections and workers
      
      isRunning = false;
      console.log(`[FreightService] Stopped.`);
    },

    getStatus() {
      try {
        const env = getEnv();
        return { status: "ok", env: env.NODE_ENV };
      } catch (error) {
        return { status: "error", env: "unknown" };
      }
    }
  };
}

// Standalone execution support
if (require.main === module) {
  const app = createFreightService();
  
  app.start().catch((err) => {
    console.error("[FreightService] Failed to start:", err);
    process.exit(1);
  });

  process.on("SIGINT", async () => {
    await app.stop();
    process.exit(0);
  });
}

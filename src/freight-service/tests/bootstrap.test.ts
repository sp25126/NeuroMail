import { describe, it, expect, vi } from "vitest";
import { createFreightService } from "../index";
import * as envModule from "../config/env";

describe("Freight Service Bootstrap", () => {
  it("should initialize and expose correct status", () => {
    // Mock the env getter
    vi.spyOn(envModule, "getEnv").mockReturnValue({
      NODE_ENV: "test",
      FREIGHT_DB_PATH: ":memory:",
    });

    const app = createFreightService();
    expect(app.getStatus()).toEqual({ status: "ok", env: "test" });
  });

  it("should start and stop gracefully", async () => {
    vi.spyOn(envModule, "getEnv").mockReturnValue({
      NODE_ENV: "test",
      FREIGHT_DB_PATH: ":memory:",
    });

    const app = createFreightService();
    
    await expect(app.start()).resolves.not.toThrow();
    await expect(app.stop()).resolves.not.toThrow();
  });
});

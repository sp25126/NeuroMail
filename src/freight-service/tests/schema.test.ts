import { describe, it, expect, afterEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../lib/db";
import { FreightSettingsSchema, FreightMailboxSchema } from "../domain/models";
import { updateTenantSettings, registerMailbox, getTenantSettings } from "../api/admin";

describe("Phase 2 Schema & Model Verifications", () => {
  afterEach(async () => {
    await db.execute("DELETE FROM freight_mailboxes");
    await db.execute("DELETE FROM freight_settings");
    await db.execute("DELETE FROM shipments");
    await db.execute("DELETE FROM shipment_identifiers");
    await db.execute("DELETE FROM raw_emails");
  });

  describe("Tenant Isolation and Settings", () => {
    it("should manage settings independently for different tenants", async () => {
      const tenantA = "tenant-a";
      const tenantB = "tenant-b";

      await updateTenantSettings(tenantA, { ingestionCadence: "*/15 * * * *" });
      await updateTenantSettings(tenantB, { ingestionCadence: "0 * * * *" });

      const settingsA = await getTenantSettings(tenantA);
      const settingsB = await getTenantSettings(tenantB);

      expect(settingsA?.ingestionCadence).toBe("*/15 * * * *");
      expect(settingsB?.ingestionCadence).toBe("0 * * * *");
    });
  });

  describe("Mailbox Validations", () => {
    it("should fail validation for invalid mailbox config schemas", () => {
      const invalidMailbox = {
        id: "not-a-uuid", // Invalid UUID
        tenantId: "", // Empty tenant
        providerType: "YAHOO" as any, // Invalid provider
        connectionStatus: "ACTIVE" as any, // Invalid status
        createdAt: "invalid-date",
        updatedAt: "invalid-date"
      };

      const parsed = FreightMailboxSchema.safeParse(invalidMailbox);
      expect(parsed.success).toBe(false);
    });

    it("should successfully register valid mailbox integration", async () => {
      const mailbox = await registerMailbox("tenant-1", {
        providerType: "GMAIL",
        connectionStatus: "CONNECTED"
      });

      expect(mailbox.id).toBeDefined();
      expect(mailbox.tenantId).toBe("tenant-1");
      expect(mailbox.providerType).toBe("GMAIL");
    });
  });

  describe("Shipment Identifiers Deduplication", () => {
    it("should block duplicate identifiers of same type and value within same tenant", async () => {
      const tenantId = "tenant-1";
      const shipmentId = uuidv4();
      const now = new Date().toISOString();

      // Create dummy shipment
      await db.execute(
        "INSERT INTO shipments (id, tenant_id, current_status, created_at, updated_at) VALUES (?, ?, 'UNKNOWN', ?, ?)",
        [shipmentId, tenantId, now, now]
      );

      // Create first identifier
      const id1 = uuidv4();
      await db.execute(
        "INSERT INTO shipment_identifiers (id, tenant_id, shipment_id, identifier_type, normalized_value, created_at) VALUES (?, ?, ?, 'CONTAINER_NUMBER', 'MSCU1234566', ?)",
        [id1, tenantId, shipmentId, now]
      );

      // Attempt to insert duplicate container number in same tenant
      const id2 = uuidv4();
      await expect(
        db.execute(
          "INSERT INTO shipment_identifiers (id, tenant_id, shipment_id, identifier_type, normalized_value, created_at) VALUES (?, ?, ?, 'CONTAINER_NUMBER', 'MSCU1234566', ?)",
          [id2, tenantId, shipmentId, now]
        )
      ).rejects.toThrow();
    });

    it("should allow duplicate identifier values under different tenants", async () => {
      const tenant1 = "tenant-1";
      const tenant2 = "tenant-2";
      const now = new Date().toISOString();

      const ship1 = uuidv4();
      const ship2 = uuidv4();

      await db.execute("INSERT INTO shipments (id, tenant_id, created_at, updated_at) VALUES (?, ?, ?, ?)", [ship1, tenant1, now, now]);
      await db.execute("INSERT INTO shipments (id, tenant_id, created_at, updated_at) VALUES (?, ?, ?, ?)", [ship2, tenant2, now, now]);

      const id1 = uuidv4();
      const id2 = uuidv4();

      await expect(
        db.execute(
          "INSERT INTO shipment_identifiers (id, tenant_id, shipment_id, identifier_type, normalized_value, created_at) VALUES (?, ?, ?, 'CONTAINER_NUMBER', 'MSCU1234566', ?)",
          [id1, tenant1, ship1, now]
        )
      ).resolves.not.toThrow();

      // Same value, but different tenant
      await expect(
        db.execute(
          "INSERT INTO shipment_identifiers (id, tenant_id, shipment_id, identifier_type, normalized_value, created_at) VALUES (?, ?, ?, 'CONTAINER_NUMBER', 'MSCU1234566', ?)",
          [id2, tenant2, ship2, now]
        )
      ).resolves.not.toThrow();
    });
  });
});

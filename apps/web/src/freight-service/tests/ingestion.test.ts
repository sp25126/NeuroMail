import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../lib/db";
import { ingestEmail } from "../services/ingestion";

describe("Email Ingestion Integration", () => {
  const tenantId = "tenant-test";
  const mailboxId = uuidv4();

  beforeEach(async () => {
    // Insert dummy mailbox to satisfy foreign key constraints
    const now = new Date().toISOString();
    await db.execute(
      "INSERT INTO freight_mailboxes (id, tenant_id, provider_type, connection_status, created_at, updated_at) VALUES (?, ?, 'GMAIL', 'CONNECTED', ?, ?)",
      [mailboxId, tenantId, now, now]
    );
  });

  afterEach(async () => {
    await db.execute("DELETE FROM shipment_identifiers");
    await db.execute("DELETE FROM shipments");
    await db.execute("DELETE FROM raw_emails");
    await db.execute("DELETE FROM freight_mailboxes");
  });

  it("should successfully ingest a freight email and create shipment records", async () => {
    const email = {
      tenantId,
      mailboxId,
      messageId: "msg-12345",
      threadId: "thread-abc",
      mailboxType: "GMAIL" as const,
      subject: "Shipment status for MSCU1234566", // valid container MSCU1234566
      fromAddress: "carrier@msc.com",
      receivedAt: new Date().toISOString(),
      body: "Please track MSCU1234566. Vessel is arriving soon.",
    };

    const result = await ingestEmail(email);
    expect(result.success).toBe(true);
    expect(result.discoveredShipments).toHaveLength(1);

    // Verify DB records
    const rawEmail = await db.queryOne("SELECT * FROM raw_emails WHERE provider_message_id = ?", [email.messageId]);
    expect(rawEmail).toBeDefined();
    expect(rawEmail.subject).toBe(email.subject);

    const identifier = await db.queryOne("SELECT * FROM shipment_identifiers WHERE shipment_id = ?", [result.discoveredShipments[0]]);
    expect(identifier).toBeDefined();
    expect(identifier.normalized_value).toBe("MSCU1234566");
    expect(identifier.identifier_type).toBe("CONTAINER_NUMBER");
  });

  it("should not process duplicate email messages", async () => {
    const email = {
      tenantId,
      mailboxId,
      messageId: "msg-duplicate",
      mailboxType: "GMAIL" as const,
      subject: "Shipment for MSCU1234566",
      fromAddress: "carrier@msc.com",
      receivedAt: new Date().toISOString(),
      body: "Vessel arrival update.",
    };

    // First ingestion
    const firstResult = await ingestEmail(email);
    expect(firstResult.success).toBe(true);

    // Duplicate ingestion
    const secondResult = await ingestEmail(email);
    expect(secondResult.success).toBe(true);
    expect(secondResult.message?.toLowerCase()).toContain("duplicate");
    expect(secondResult.discoveredShipments).toHaveLength(0);
  });

  it("should associate new emails with existing shipments without duplicates", async () => {
    // Ingest first email introducing the shipment
    await ingestEmail({
      tenantId,
      mailboxId,
      messageId: "msg-first",
      mailboxType: "GMAIL" as const,
      subject: "New shipment MSCU1234566",
      fromAddress: "carrier@msc.com",
      receivedAt: new Date().toISOString(),
      body: "Shipment dispatch info.",
    });

    // Ingest second email mentioning the same shipment
    const result = await ingestEmail({
      tenantId,
      mailboxId,
      messageId: "msg-second",
      mailboxType: "GMAIL" as const,
      subject: "Update for MSCU1234566",
      fromAddress: "carrier@msc.com",
      receivedAt: new Date().toISOString(),
      body: "ETA delay details.",
    });

    expect(result.success).toBe(true);

    // Verify database only has 1 shipment record
    const identifiers = await db.query(
      "SELECT * FROM shipment_identifiers WHERE tenant_id = ? AND normalized_value = ?",
      [tenantId, "MSCU1234566"]
    );
    expect(identifiers).toHaveLength(1);
  });
});

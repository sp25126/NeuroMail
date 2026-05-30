import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../lib/db";
import { syncMailbox, runIngestionSync } from "../workers/worker";
import { GmailConnector } from "../services/connectors/gmail";
import { OutlookConnector } from "../services/connectors/outlook";

describe("Ingestion Worker Scheduled Sync tests", () => {
  const tenantId = "tenant-sync";
  const mailboxId = uuidv4();

  beforeEach(async () => {
    // Register test mailbox
    const now = new Date().toISOString();
    await db.execute(
      "INSERT INTO freight_mailboxes (id, tenant_id, provider_type, connection_status, created_at, updated_at) VALUES (?, ?, 'GMAIL', 'CONNECTED', ?, ?)",
      [mailboxId, tenantId, now, now]
    );
  });

  afterEach(async () => {
    await db.execute("DELETE FROM raw_emails");
    await db.execute("DELETE FROM freight_mailboxes");
    vi.restoreAllMocks();
  });

  it("should list, fetch, filter, and ingest candidate messages successfully", async () => {
    // Mock listMessages
    const listSpy = vi.spyOn(GmailConnector.prototype, "listMessages").mockResolvedValue([
      { id: "msg-1", threadId: "thread-1" },
      { id: "msg-2", threadId: "thread-2" }
    ]);

    // Mock fetchMessage
    const fetchSpy = vi.spyOn(GmailConnector.prototype, "fetchMessage").mockImplementation(async (config, token, id) => {
      if (id === "msg-1") {
        return {
          id: "msg-1",
          threadId: "thread-1",
          sender: "carrier@test.com",
          subject: "Freight info for MSCU1234566",
          body: "Please check container MSCU1234566 details.",
          receivedAt: new Date().toISOString()
        };
      }
      // msg-2 is unrelated
      return {
        id: "msg-2",
        threadId: "thread-2",
        sender: "friend@test.com",
        subject: "Hello there",
        body: "Unrelated text",
        receivedAt: new Date().toISOString()
      };
    });

    const mailbox = await db.queryOne("SELECT * FROM freight_mailboxes WHERE id = ?", [mailboxId]);
    const stats = await syncMailbox(mailbox);

    expect(stats.success).toBe(true);
    expect(stats.processedCount).toBe(2);
    expect(stats.insertedCount).toBe(1); // msg-1 should be inserted
    expect(stats.ignoredCount).toBe(1); // msg-2 should be ignored

    // Verify DB
    const inserted = await db.query("SELECT * FROM raw_emails WHERE mailbox_id = ?", [mailboxId]);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].provider_message_id).toBe("msg-1");
    expect(inserted[0].processing_status).toBe("PENDING");

    // Verify last_sync_time updated
    const updatedMailbox = await db.queryOne("SELECT last_sync_time FROM freight_mailboxes WHERE id = ?", [mailboxId]);
    expect(updatedMailbox.last_sync_time).toBeDefined();
    expect(updatedMailbox.last_sync_time).not.toBeNull();
  });

  it("should fail gracefully on connector error and update mailbox status", async () => {
    vi.spyOn(GmailConnector.prototype, "listMessages").mockRejectedValue(new Error("API Rate Limit Exceeded"));

    const mailbox = await db.queryOne("SELECT * FROM freight_mailboxes WHERE id = ?", [mailboxId]);
    const stats = await syncMailbox(mailbox);

    expect(stats.success).toBe(false);
    expect(stats.error).toBe("API Rate Limit Exceeded");

    // Verify mailbox is marked as EXPIRED (errors status)
    const updatedMailbox = await db.queryOne("SELECT connection_status FROM freight_mailboxes WHERE id = ?", [mailboxId]);
    expect(updatedMailbox.connection_status).toBe("EXPIRED");
  });

  it("should run bulk sync sequentially without failing when one mailbox crashes", async () => {
    const secondMailboxId = uuidv4();
    const now = new Date().toISOString();
    await db.execute(
      "INSERT INTO freight_mailboxes (id, tenant_id, provider_type, connection_status, created_at, updated_at) VALUES (?, ?, 'OUTLOOK', 'CONNECTED', ?, ?)",
      [secondMailboxId, tenantId, now, now]
    );

    // Gmail fails, Outlook succeeds
    vi.spyOn(GmailConnector.prototype, "listMessages").mockRejectedValue(new Error("Gmail Outage"));
    vi.spyOn(OutlookConnector.prototype, "listMessages").mockResolvedValue([
      { id: "msg-outlook-1", threadId: "thread-outlook" }
    ]);
    vi.spyOn(OutlookConnector.prototype, "fetchMessage").mockResolvedValue({
      id: "msg-outlook-1",
      threadId: "thread-outlook",
      sender: "outlook@test.com",
      subject: "Urgent shipment booking update",
      body: "Tracking number is MSCU1234566.",
      receivedAt: new Date().toISOString()
    });

    const results = await runIngestionSync();
    expect(results).toHaveLength(2);

    const gmailResult = results.find(r => r.mailboxId === mailboxId);
    const outlookResult = results.find(r => r.mailboxId === secondMailboxId);

    expect(gmailResult?.success).toBe(false);
    expect(outlookResult?.success).toBe(true);
    expect(outlookResult?.insertedCount).toBe(1);

    await db.execute("DELETE FROM freight_mailboxes WHERE id = ?", [secondMailboxId]);
  });
});

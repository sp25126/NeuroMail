import { db } from "../../lib/db";
import { GmailConnector } from "../services/connectors/gmail";
import { OutlookConnector } from "../services/connectors/outlook";
import { MailConnector, NormalizedMessage } from "../services/connectors/base";
import { isFreightRelatedSubject, parseEmailEntities } from "../services/discovery";
import { v4 as uuidv4 } from "uuid";

const GMAIL_CONNECTOR = new GmailConnector();
const OUTLOOK_CONNECTOR = new OutlookConnector();

function getConnector(providerType: string): MailConnector {
  if (providerType === "GMAIL") return GMAIL_CONNECTOR;
  if (providerType === "OUTLOOK") return OUTLOOK_CONNECTOR;
  throw new Error(`Unsupported mailbox provider: ${providerType}`);
}

/**
 * Checks if a message is a candidate for freight module parsing.
 * Matches subject keywords or if it contains potential shipment identifiers in the body.
 */
export function isFreightCandidate(subject: string, body: string): boolean {
  if (isFreightRelatedSubject(subject)) {
    return true;
  }
  const { containerNumbers, billsOfLading } = parseEmailEntities(subject, body);
  return containerNumbers.length > 0 || billsOfLading.length > 0;
}

export interface SyncStats {
  mailboxId: string;
  processedCount: number;
  insertedCount: number;
  duplicateCount: number;
  ignoredCount: number;
  success: boolean;
  error?: string;
}

export async function syncMailbox(mailbox: {
  id: string;
  tenant_id: string;
  provider_type: string;
  mailbox_config: string | null;
  encrypted_token: string | null;
  last_sync_time: string | null;
}): Promise<SyncStats> {
  const stats: SyncStats = {
    mailboxId: mailbox.id,
    processedCount: 0,
    insertedCount: 0,
    duplicateCount: 0,
    ignoredCount: 0,
    success: true
  };

  const now = new Date().toISOString();

  try {
    const connector = getConnector(mailbox.provider_type);
    const token = mailbox.encrypted_token || ""; // Decrypt in production

    // 1. List candidate message headers
    const headers = await connector.listMessages(
      mailbox.mailbox_config || "{}",
      token,
      mailbox.last_sync_time || undefined
    );

    stats.processedCount = headers.length;

    for (const header of headers) {
      // 2. Check deduplication before fetching full payload
      const existing = await db.queryOne(
        "SELECT id FROM raw_emails WHERE tenant_id = ? AND mailbox_id = ? AND provider_message_id = ?",
        [mailbox.tenant_id, mailbox.id, header.id]
      );

      if (existing) {
        stats.duplicateCount++;
        continue;
      }

      // 3. Fetch full message
      let message: NormalizedMessage;
      try {
        message = await connector.fetchMessage(
          mailbox.mailbox_config || "{}",
          token,
          header.id
        );
      } catch (err: any) {
        console.error(`[Worker] Failed to fetch message details for msg ${header.id}:`, err.message);
        continue;
      }

      // 4. Verify discovery filters
      if (!isFreightCandidate(message.subject, message.body)) {
        stats.ignoredCount++;
        continue;
      }

      // 5. Persist raw email to DB
      const emailId = uuidv4();
      await db.execute(
        `INSERT INTO raw_emails (id, tenant_id, mailbox_id, provider_message_id, provider_thread_id, sender, subject, body_preview, processing_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
        [
          emailId,
          mailbox.tenant_id,
          mailbox.id,
          message.id,
          message.threadId || null,
          message.sender,
          message.subject,
          message.body.substring(0, 150),
          message.receivedAt
        ]
      );

      stats.insertedCount++;
    }

    // 6. Update sync checkpoints
    await db.execute(
      `UPDATE freight_mailboxes
       SET connection_status = 'CONNECTED',
           last_sync_time = ?,
           updated_at = ?
       WHERE id = ?`,
      [now, now, mailbox.id]
    );

  } catch (error: any) {
    stats.success = false;
    stats.error = error.message;
    console.error(`[Worker] Ingestion sync failed for mailbox ${mailbox.id}:`, error.message);

    // Update error state
    await db.execute(
      `UPDATE freight_mailboxes
       SET connection_status = 'EXPIRED',
           updated_at = ?
       WHERE id = ?`,
      [now, mailbox.id]
    );
  }

  return stats;
}

/**
 * Runs the ingestion scheduled job across all active freight mailboxes.
 */
export async function runIngestionSync(): Promise<SyncStats[]> {
  const activeMailboxes = await db.query(
    "SELECT * FROM freight_mailboxes WHERE connection_status != 'DISCONNECTED'"
  );

  const results: SyncStats[] = [];

  for (const mailbox of activeMailboxes) {
    // Run sequentially to protect API rate limits and avoid database locks
    const stats = await syncMailbox(mailbox);
    results.push(stats);
  }

  return results;
}

import { v4 as uuidv4 } from "uuid";
import { db } from "../../lib/db";
import { parseEmailEntities } from "./discovery";

export interface EmailIngestionInput {
  tenantId: string;
  mailboxId: string;
  messageId: string;
  threadId?: string;
  mailboxType: "GMAIL" | "OUTLOOK";
  subject: string;
  fromAddress: string;
  receivedAt: string; // ISO string
  body: string;
  snippet?: string;
}

export interface IngestionResult {
  success: boolean;
  message?: string;
  discoveredShipments: string[];
}

export async function ingestEmail(email: EmailIngestionInput): Promise<IngestionResult> {
  // 1. Check if email was already processed in raw_emails
  const existingEmail = await db.queryOne(
    "SELECT id FROM raw_emails WHERE tenant_id = ? AND mailbox_id = ? AND provider_message_id = ?",
    [email.tenantId, email.mailboxId, email.messageId]
  );

  if (existingEmail) {
    return {
      success: true,
      message: "Email already processed (duplicate message_id)",
      discoveredShipments: []
    };
  }

  // 2. Parse email entities
  const { containerNumbers, billsOfLading } = parseEmailEntities(email.subject, email.body);

  if (containerNumbers.length === 0 && billsOfLading.length === 0) {
    return {
      success: true,
      message: "No shipment entities discovered in email",
      discoveredShipments: []
    };
  }

  // 3. Save raw email
  const emailId = uuidv4();
  await db.execute(
    `INSERT INTO raw_emails (id, tenant_id, mailbox_id, provider_message_id, provider_thread_id, sender, subject, body_preview, processing_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      emailId,
      email.tenantId,
      email.mailboxId,
      email.messageId,
      email.threadId || null,
      email.fromAddress,
      email.subject,
      email.snippet || email.body.substring(0, 100),
      "PROCESSED",
      new Date().toISOString()
    ]
  );

  const discoveredShipments: string[] = [];

  // 4. Ingest discovered container numbers
  for (const container of containerNumbers) {
    const existingId = await db.queryOne(
      "SELECT shipment_id FROM shipment_identifiers WHERE tenant_id = ? AND identifier_type = 'CONTAINER_NUMBER' AND normalized_value = ?",
      [email.tenantId, container]
    );

    if (existingId) {
      discoveredShipments.push(existingId.shipment_id);
      continue;
    }

    const shipmentId = uuidv4();
    const now = new Date().toISOString();

    // Create Shipment record
    await db.execute(
      `INSERT INTO shipments (id, tenant_id, current_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [shipmentId, email.tenantId, "UNKNOWN", now, now]
    );

    // Create Shipment Identifier record
    const identifierId = uuidv4();
    await db.execute(
      `INSERT INTO shipment_identifiers (id, tenant_id, shipment_id, identifier_type, normalized_value, original_value, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [identifierId, email.tenantId, shipmentId, "CONTAINER_NUMBER", container, container, now]
    );

    discoveredShipments.push(shipmentId);
  }

  // 5. Ingest discovered Bills of Lading
  for (const bol of billsOfLading) {
    const existingId = await db.queryOne(
      "SELECT shipment_id FROM shipment_identifiers WHERE tenant_id = ? AND identifier_type = 'BILL_OF_LADING' AND normalized_value = ?",
      [email.tenantId, bol]
    );

    if (existingId) {
      discoveredShipments.push(existingId.shipment_id);
      continue;
    }

    const shipmentId = uuidv4();
    const now = new Date().toISOString();

    // Create Shipment record
    await db.execute(
      `INSERT INTO shipments (id, tenant_id, current_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [shipmentId, email.tenantId, "UNKNOWN", now, now]
    );

    // Create Shipment Identifier record
    const identifierId = uuidv4();
    await db.execute(
      `INSERT INTO shipment_identifiers (id, tenant_id, shipment_id, identifier_type, normalized_value, original_value, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [identifierId, email.tenantId, shipmentId, "BILL_OF_LADING", bol, bol, now]
    );

    discoveredShipments.push(shipmentId);
  }

  return {
    success: true,
    message: `Ingested email source. Discovered ${containerNumbers.length} containers and ${billsOfLading.length} bills of lading.`,
    discoveredShipments
  };
}

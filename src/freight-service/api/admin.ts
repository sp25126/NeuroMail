import { v4 as uuidv4 } from "uuid";
import { db } from "../../lib/db";
import { FreightSettingsSchema, FreightMailboxSchema } from "../domain/models";

export interface SettingsUpdateInput {
  ingestionCadence?: string;
  syncCadence?: string;
  reportOptions?: string; // JSON
  alertToggles?: string; // JSON
  parsingPreferences?: string; // JSON
  featureFlags?: string; // JSON
}

export async function getTenantSettings(tenantId: string) {
  const row = await db.queryOne(
    "SELECT * FROM freight_settings WHERE tenant_id = ?",
    [tenantId]
  );
  if (!row) return null;

  // Validate database row format mapping to typescript types
  return FreightSettingsSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    ingestionCadence: row.ingestion_cadence,
    syncCadence: row.sync_cadence,
    reportOptions: row.report_options,
    alertToggles: row.alert_toggles,
    parsingPreferences: row.parsing_preferences,
    featureFlags: row.feature_flags,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

export async function updateTenantSettings(tenantId: string, input: SettingsUpdateInput) {
  const existing = await getTenantSettings(tenantId);
  const now = new Date().toISOString();

  if (!existing) {
    // Create new
    const id = uuidv4();
    await db.execute(
      `INSERT INTO freight_settings (
        id, tenant_id, ingestion_cadence, sync_cadence, report_options, alert_toggles, parsing_preferences, feature_flags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tenantId,
        input.ingestionCadence || null,
        input.syncCadence || null,
        input.reportOptions || null,
        input.alertToggles || null,
        input.parsingPreferences || null,
        input.featureFlags || null,
        now,
        now
      ]
    );
    return getTenantSettings(tenantId);
  } else {
    // Update existing
    await db.execute(
      `UPDATE freight_settings
       SET ingestion_cadence = COALESCE(?, ingestion_cadence),
           sync_cadence = COALESCE(?, sync_cadence),
           report_options = COALESCE(?, report_options),
           alert_toggles = COALESCE(?, alert_toggles),
           parsing_preferences = COALESCE(?, parsing_preferences),
           feature_flags = COALESCE(?, feature_flags),
           updated_at = ?
       WHERE tenant_id = ?`,
      [
        input.ingestionCadence ?? null,
        input.syncCadence ?? null,
        input.reportOptions ?? null,
        input.alertToggles ?? null,
        input.parsingPreferences ?? null,
        input.featureFlags ?? null,
        now,
        tenantId
      ]
    );
    return getTenantSettings(tenantId);
  }
}

export interface RegisterMailboxInput {
  providerType: "GMAIL" | "OUTLOOK";
  connectionStatus: "CONNECTED" | "DISCONNECTED" | "EXPIRED";
  mailboxConfig?: string;
  encryptedToken?: string;
}

export async function registerMailbox(tenantId: string, input: RegisterMailboxInput) {
  const id = uuidv4();
  const now = new Date().toISOString();

  // Strict input validation
  const record = FreightMailboxSchema.parse({
    id,
    tenantId,
    providerType: input.providerType,
    connectionStatus: input.connectionStatus,
    mailboxConfig: input.mailboxConfig || null,
    encryptedToken: input.encryptedToken || null,
    createdAt: now,
    updatedAt: now
  });

  await db.execute(
    `INSERT INTO freight_mailboxes (id, tenant_id, provider_type, connection_status, mailbox_config, encrypted_token, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.tenantId,
      record.providerType,
      record.connectionStatus,
      record.mailboxConfig || null,
      record.encryptedToken || null,
      record.createdAt,
      record.updatedAt
    ]
  );

  return record;
}

export async function getTenantMailboxes(tenantId: string) {
  const rows = await db.query(
    "SELECT * FROM freight_mailboxes WHERE tenant_id = ?",
    [tenantId]
  );

  return rows.map(row => FreightMailboxSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    providerType: row.provider_type,
    connectionStatus: row.connection_status,
    lastSyncTime: row.last_sync_time,
    mailboxConfig: row.mailbox_config,
    encryptedToken: row.encrypted_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function getMailboxSyncStatus(tenantId: string, mailboxId: string) {
  const row = await db.queryOne(
    "SELECT id, tenant_id, provider_type, connection_status, last_sync_time FROM freight_mailboxes WHERE tenant_id = ? AND id = ?",
    [tenantId, mailboxId]
  );

  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    providerType: row.provider_type,
    connectionStatus: row.connection_status,
    lastSyncTime: row.last_sync_time
  };
}

export async function getIngestionStats(tenantId: string) {
  const emailsCount = await db.queryOne(
    "SELECT COUNT(*) as count FROM raw_emails WHERE tenant_id = ?",
    [tenantId]
  );

  const pendingCount = await db.queryOne(
    "SELECT COUNT(*) as count FROM raw_emails WHERE tenant_id = ? AND processing_status = 'PENDING'",
    [tenantId]
  );

  const processedCount = await db.queryOne(
    "SELECT COUNT(*) as count FROM raw_emails WHERE tenant_id = ? AND processing_status = 'PROCESSED'",
    [tenantId]
  );

  return {
    totalIngestedEmails: emailsCount?.count || 0,
    pendingEmails: pendingCount?.count || 0,
    processedEmails: processedCount?.count || 0
  };
}

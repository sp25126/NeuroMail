import { z } from "zod";

// --- ENUMS & CONSTANTS ---
export const MailboxProviderSchema = z.enum(["GMAIL", "OUTLOOK"]);
export type MailboxProvider = z.infer<typeof MailboxProviderSchema>;

export const MailboxConnectionStatusSchema = z.enum(["CONNECTED", "DISCONNECTED", "EXPIRED"]);
export type MailboxConnectionStatus = z.infer<typeof MailboxConnectionStatusSchema>;

export const EmailProcessingStatusSchema = z.enum(["PENDING", "PROCESSED", "FAILED", "QUARANTINED"]);
export type EmailProcessingStatus = z.infer<typeof EmailProcessingStatusSchema>;

export const ShipmentStatusSchema = z.enum([
  "IN_TRANSIT",
  "ARRIVED_PORT",
  "AVAILABLE_PICKUP",
  "DELIVERED",
  "CANCELLED",
  "UNKNOWN"
]);
export type ShipmentStatus = z.infer<typeof ShipmentStatusSchema>;

export const IdentifierTypeSchema = z.enum([
  "REFERENCE",
  "BILL_OF_LADING",
  "BOOKING_NUMBER",
  "CONTAINER_NUMBER",
  "TRACKING_ID"
]);
export type IdentifierType = z.infer<typeof IdentifierTypeSchema>;

export const AlertTypeSchema = z.enum([
  "PORT_ARRIVAL",
  "AVAILABLE_PICKUP",
  "DELAY",
  "APPROACHING_LFD",
  "NO_UPDATE"
]);
export type AlertType = z.infer<typeof AlertTypeSchema>;

export const AlertSeveritySchema = z.enum(["INFO", "WARNING", "CRITICAL"]);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const AlertStatusSchema = z.enum(["ACTIVE", "ACKNOWLEDGED", "RESOLVED", "FAILED"]);
export type AlertStatus = z.infer<typeof AlertStatusSchema>;

export const ReportJobStatusSchema = z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]);
export type ReportJobStatus = z.infer<typeof ReportJobStatusSchema>;


// --- ENTITY SCHEMAS ---

export const FreightMailboxSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  providerType: MailboxProviderSchema,
  connectionStatus: MailboxConnectionStatusSchema,
  lastSyncTime: z.string().datetime().nullable().optional(),
  mailboxConfig: z.string().nullable().optional(), // JSON config
  encryptedToken: z.string().nullable().optional(), // Encrypted tokens
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type FreightMailbox = z.infer<typeof FreightMailboxSchema>;

export const RawEmailSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  mailboxId: z.string().uuid(),
  providerMessageId: z.string().min(1),
  providerThreadId: z.string().nullable().optional(),
  sender: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  bodyPreview: z.string().nullable().optional(),
  processingStatus: EmailProcessingStatusSchema.default("PENDING"),
  createdAt: z.string().datetime()
});
export type RawEmail = z.infer<typeof RawEmailSchema>;

export const ShipmentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  currentStatus: ShipmentStatusSchema.default("UNKNOWN"),
  latestEta: z.string().datetime().nullable().optional(),
  origin: z.string().nullable().optional(),
  destination: z.string().nullable().optional(),
  lastFreeDay: z.string().nullable().optional(), // YYYY-MM-DD format
  currentProvider: z.string().nullable().optional(),
  riskFlags: z.string().nullable().optional(), // JSON array
  lastSyncedTime: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type Shipment = z.infer<typeof ShipmentSchema>;

export const ShipmentIdentifierSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  shipmentId: z.string().uuid(),
  identifierType: IdentifierTypeSchema,
  normalizedValue: z.string().min(1),
  originalValue: z.string().nullable().optional(),
  createdAt: z.string().datetime()
});
export type ShipmentIdentifier = z.infer<typeof ShipmentIdentifierSchema>;

export const ShipmentEventSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  shipmentId: z.string().uuid(),
  sourceProvider: z.string().nullable().optional(),
  sourceEventKey: z.string().nullable().optional(),
  normalizedMilestone: z.string().min(1),
  rawPayload: z.string().nullable().optional(), // JSON raw payload
  eventTime: z.string().datetime(),
  recordedTime: z.string().datetime()
});
export type ShipmentEvent = z.infer<typeof ShipmentEventSchema>;

export const AlertSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  shipmentId: z.string().uuid(),
  alertType: AlertTypeSchema,
  severity: AlertSeveritySchema,
  status: AlertStatusSchema.default("ACTIVE"),
  dedupeKey: z.string().min(1),
  triggerReason: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type Alert = z.infer<typeof AlertSchema>;

export const ReportJobSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  reportType: z.string().min(1),
  timeWindow: z.string().nullable().optional(),
  generationStatus: ReportJobStatusSchema.default("PENDING"),
  requestedBy: z.string().min(1),
  failureReason: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type ReportJob = z.infer<typeof ReportJobSchema>;

export const ReportFileSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  jobId: z.string().uuid(),
  fileStorageRef: z.string().min(1),
  createdAt: z.string().datetime()
});
export type ReportFile = z.infer<typeof ReportFileSchema>;

export const FreightSettingsSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  ingestionCadence: z.string().nullable().optional(),
  syncCadence: z.string().nullable().optional(),
  reportOptions: z.string().nullable().optional(), // JSON settings
  alertToggles: z.string().nullable().optional(), // JSON config
  parsingPreferences: z.string().nullable().optional(), // JSON preferences
  featureFlags: z.string().nullable().optional(), // JSON flags
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type FreightSettings = z.infer<typeof FreightSettingsSchema>;

import { v4 as uuidv4 } from "uuid";
import { db } from "../../lib/db";

export async function seedBaselineFreightConfig(tenantId: string): Promise<void> {
  // 1. Seed Freight Settings for the Tenant
  const existingSettings = await db.queryOne(
    "SELECT id FROM freight_settings WHERE tenant_id = ?",
    [tenantId]
  );

  if (!existingSettings) {
    const settingsId = uuidv4();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO freight_settings (
        id, tenant_id, ingestion_cadence, sync_cadence, report_options, alert_toggles, parsing_preferences, feature_flags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        settingsId,
        tenantId,
        "*/15 * * * *", // Every 15 minutes
        "0 */2 * * *",  // Every 2 hours
        JSON.stringify({ dailyEmail: true }),
        JSON.stringify({ PORT_ARRIVAL: true, AVAILABLE_PICKUP: true, DELAY: true, APPROACHING_LFD: true }),
        JSON.stringify({ autoParse: true }),
        JSON.stringify({ llmFallback: false }),
        now,
        now
      ]
    );
    console.log(`[Seed] Seeded default freight settings for tenant: ${tenantId}`);
  }

  // 2. Seed Default Shipment Providers
  const defaultProviders = [
    { name: "Project44", endpoint: "https://api.project44.com/v1" },
    { name: "OceanInsights", endpoint: "https://api.oceaninsights.com/v2" }
  ];

  for (const provider of defaultProviders) {
    const existing = await db.queryOne(
      "SELECT id FROM shipment_providers WHERE provider_name = ?",
      [provider.name]
    );

    if (!existing) {
      const providerId = uuidv4();
      await db.execute(
        "INSERT INTO shipment_providers (id, provider_name, api_endpoint, is_active) VALUES (?, ?, ?, 1)",
        [providerId, provider.name, provider.endpoint]
      );
      console.log(`[Seed] Seeded default shipment provider: ${provider.name}`);
    }
  }
}

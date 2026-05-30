import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();
        const { action } = body; // action is 'APPROVED' or 'REJECTED'
        const tenantId = session.user.id || "demo-tenant";
        const now = new Date().toISOString();

        // 1. Fetch quarantined record
        const record = await db.queryOne(
            "SELECT * FROM parsed_email_records WHERE id = ? AND tenant_id = ?",
            [id, tenantId]
        );

        if (!record) {
            return Response.json({ error: "Quarantined record not found" }, { status: 404 });
        }

        // 2. Perform review action
        await db.execute(
            `UPDATE parsed_email_records 
             SET reviewed_at = ?, reviewed_by = ?, review_action = ? 
             WHERE id = ?`,
            [now, session.user.id, action, id]
        );

        if (action === "APPROVED") {
            const parsedData = record.parsed_json ? JSON.parse(record.parsed_json) : {};
            const shipmentId = uuidv4();

            // Create shipment
            await db.execute(
                `INSERT INTO shipments (
                    id, tenant_id, current_status, latest_eta, origin, destination, last_free_day, current_provider, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    shipmentId,
                    tenantId,
                    parsedData.status || "UNKNOWN",
                    parsedData.eta || null,
                    parsedData.origin || null,
                    parsedData.destination || null,
                    parsedData.lastFreeDay || null,
                    parsedData.carrier || null,
                    now,
                    now
                ]
            );

            // Create shipment identifiers
            if (parsedData.containerNumber) {
                await db.execute(
                    `INSERT INTO shipment_identifiers (
                        id, tenant_id, shipment_id, identifier_type, normalized_value, original_value, created_at
                    ) VALUES (?, ?, ?, 'CONTAINER_NUMBER', ?, ?, ?)`,
                    [
                        uuidv4(),
                        tenantId,
                        shipmentId,
                        parsedData.containerNumber.toUpperCase().trim(),
                        parsedData.containerNumber,
                        now
                    ]
                );
            }

            if (parsedData.bookingNumber) {
                await db.execute(
                    `INSERT INTO shipment_identifiers (
                        id, tenant_id, shipment_id, identifier_type, normalized_value, original_value, created_at
                    ) VALUES (?, ?, ?, 'BOOKING_NUMBER', ?, ?, ?)`,
                    [
                        uuidv4(),
                        tenantId,
                        shipmentId,
                        parsedData.bookingNumber.toUpperCase().trim(),
                        parsedData.bookingNumber,
                        now
                    ]
                );
            }
        }

        return Response.json({ success: true });
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { shipmentId } = body;
        const tenantId = session.user.id || "demo-tenant";

        // Requeue by resetting retry count and removing from DLQ
        await db.execute(
            "DELETE FROM dlq_failed_tracking WHERE shipment_id = ? AND tenant_id = ?",
            [shipmentId, tenantId]
        );

        // Update shipment to allow retry sync
        await db.execute(
            "UPDATE shipments SET last_synced_time = NULL, updated_at = ? WHERE id = ? AND tenant_id = ?",
            [new Date().toISOString(), shipmentId, tenantId]
        );

        return Response.json({ success: true });
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

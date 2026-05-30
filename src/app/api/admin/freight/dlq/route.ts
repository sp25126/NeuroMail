import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const tenantId = session.user.id || "demo-tenant";

        const rows = await db.query(
            "SELECT * FROM dlq_failed_tracking WHERE tenant_id = ? ORDER BY created_at DESC",
            [tenantId]
        );

        return Response.json(rows);
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

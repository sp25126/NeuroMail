import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(
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
        const tenantId = session.user.id || "demo-tenant";

        // Update connection status
        if (body.connectionStatus) {
            await db.execute(
                `UPDATE freight_mailboxes 
                 SET connection_status = ?, updated_at = ? 
                 WHERE id = ? AND tenant_id = ?`,
                [body.connectionStatus, new Date().toISOString(), id, tenantId]
            );
        }

        return Response.json({ success: true });
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

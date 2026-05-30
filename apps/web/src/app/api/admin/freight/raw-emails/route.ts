import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const url = new URL(req.url);
        const mailboxId = url.searchParams.get("mailbox_id");
        const limit = parseInt(url.searchParams.get("limit") || "50");
        const offset = parseInt(url.searchParams.get("offset") || "0");
        const tenantId = session.user.id || "demo-tenant";

        let query = "SELECT * FROM raw_emails WHERE tenant_id = ?";
        const params: any[] = [tenantId];

        if (mailboxId) {
            query += " AND mailbox_id = ?";
            params.push(mailboxId);
        }

        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
        params.push(limit, offset);

        const rows = await db.query(query, params);
        return Response.json(rows);
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

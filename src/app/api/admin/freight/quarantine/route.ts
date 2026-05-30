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

        // Query validation_failed and unmatched parsed records
        const rows = await db.query(
            `SELECT p.*, r.subject, r.sender, r.created_at as received_at 
             FROM parsed_email_records p
             JOIN raw_emails r ON p.raw_email_id = r.id
             WHERE p.tenant_id = ? AND p.status IN ('validation_failed', 'unmatched') AND p.reviewed_at IS NULL
             ORDER BY p.created_at DESC`,
            [tenantId]
        );

        return Response.json(rows);
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const tenantId = session.user.id || "demo-tenant";
        const id = uuidv4();
        const now = new Date().toISOString();

        await db.execute(
            `INSERT INTO freight_templates (
                id, tenant_id, carrier, email_type, subject_pattern, body_rules_json, active, sample_test_payloads, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
            [
                id,
                tenantId,
                body.carrier,
                body.emailType,
                body.subjectPattern,
                JSON.stringify(body.bodyRules || []),
                JSON.stringify(body.sampleTestPayloads || []),
                now,
                now
            ]
        );

        return Response.json({ id, success: true }, { status: 201 });
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

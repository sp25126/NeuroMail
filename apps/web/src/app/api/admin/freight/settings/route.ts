import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getTenantSettings, updateTenantSettings } from "@/freight-service/api/admin";

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const tenantId = session.user.id || "demo-tenant";
        let settings = await getTenantSettings(tenantId);
        if (!settings) {
            // Auto create baseline settings
            settings = await updateTenantSettings(tenantId, {});
        }
        return Response.json(settings);
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const tenantId = session.user.id || "demo-tenant";
        const body = await req.json();
        const updated = await updateTenantSettings(tenantId, body);
        return Response.json(updated);
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

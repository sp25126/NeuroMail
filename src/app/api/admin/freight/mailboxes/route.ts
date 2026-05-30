import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { registerMailbox, getTenantMailboxes } from "@/freight-service/api/admin";

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const tenantId = session.user.id || "demo-tenant";
        const mailboxes = await getTenantMailboxes(tenantId);
        return Response.json(mailboxes);
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const tenantId = session.user.id || "demo-tenant";
        
        const mailbox = await registerMailbox(tenantId, {
            providerType: body.providerType,
            connectionStatus: body.connectionStatus || "CONNECTED",
            mailboxConfig: body.mailboxConfig,
            encryptedToken: body.encryptedToken
        });

        return Response.json(mailbox, { status: 201 });
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

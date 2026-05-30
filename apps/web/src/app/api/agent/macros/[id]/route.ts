import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createLogger } from "@/agent/observability/logger";

const logger = createLogger("API.Macros.Detail");

// DELETE /api/agent/macros/[id] - Delete macro
export async function DELETE(
    req: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await props.params;

        await db.execute(
            "UPDATE macros SET deleted_at = ? WHERE id = ? AND user_id = ?",
            [new Date().toISOString(), id, session.user.id]
        );

        logger.info("Macro deleted", { macroId: id, userId: session.user.id });

        return Response.json({ success: true });
    } catch (error: any) {
        logger.error("Failed to delete macro", { error: error.message });
        return Response.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

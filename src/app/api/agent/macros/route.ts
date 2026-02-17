import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createLogger } from "@/agent/observability/logger";
import { z } from "zod";
import { MacroDefinitionSchema } from "@/agent/types";

const logger = createLogger("API.Macros");

// GET /api/agent/macros - List user's macros
export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const rows = await db.query(
            "SELECT * FROM macros WHERE user_id = ? AND deleted_at IS NULL ORDER BY usage_count DESC",
            [session.user.id]
        );

        const macros = rows.map((r: any) => JSON.parse(r.definition));

        return Response.json({ macros });
    } catch (error: any) {
        logger.error("Failed to list macros", { error: error.message });
        return Response.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

// POST /api/agent/macros - Create new macro
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();

        // Validate
        const macro = MacroDefinitionSchema.parse(body);

        // Store
        await db.execute(
            "INSERT INTO macros (id, user_id, definition, created_at) VALUES (?, ?, ?, ?)",
            [macro.id, session.user.id, JSON.stringify(macro), macro.createdAt]
        );

        logger.info("Macro created", {
            macroId: macro.id,
            userId: session.user.id,
        });

        return Response.json({ macro });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return Response.json(
                { error: "Invalid macro definition", details: error.issues },
                { status: 400 }
            );
        }

        logger.error("Failed to create macro", { error: error.message });
        return Response.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

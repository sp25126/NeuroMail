import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { createLogger } from "@/agent/observability/logger";

const logger = createLogger("API.Drafts");

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { to = "", subject = "", body: content = "", threadId } = body;

        const draftId = uuidv4();

        // Using user id as the owner. 
        // The query uses ON CONFLICT to permit updating existing drafts for the same thread.
        await db.execute(
            `INSERT INTO drafts (id, user_id, to_address, subject, body, thread_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, thread_id) DO UPDATE SET
         to_address = excluded.to_address,
         subject = excluded.subject,
         body = excluded.body,
         updated_at = excluded.updated_at`,
            [
                draftId,
                session.user.id,
                to,
                subject,
                content,
                threadId || null,
                new Date().toISOString(),
                new Date().toISOString(),
            ]
        );

        logger.info("Draft saved", { draftId, userId: session.user.id });

        return Response.json({ draftId });
    } catch (error: any) {
        logger.error("Failed to save draft", { error: error.message });
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}

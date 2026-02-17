import { handleApi } from "@/lib/api-handler"
import { setupGmailWatch } from "@/lib/sync"

export async function POST() {
    return handleApi({ route: "POST /api/mail/sync", requireAuth: true }, async (ctx) => {
        const result = await setupGmailWatch()

        if (!result.success) {
            const error = new Error(result.error || "Gmail watch setup failed");
            (error as any).status = 500;
            throw error;
        }

        return result
    })
}

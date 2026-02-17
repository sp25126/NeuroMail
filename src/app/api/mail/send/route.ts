import { handleApi } from "@/lib/api-handler"
import { sendEmail } from "@/lib/gmail"

export async function POST(req: Request) {
    return handleApi({ route: "POST /api/mail/send", requireAuth: true }, async (ctx) => {
        const { to, subject, body, threadId } = await req.json()

        // Validation
        if (!to) throw new Error("Recipient (to) is required")

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(to)) throw new Error("Invalid email address")

        if (!body?.trim()) throw new Error("Email body cannot be empty")

        console.log("📤 [API] Sending email to:", to, "| subject:", subject)

        const result = await sendEmail(to, subject || "(No subject)", body, threadId)

        if (!result.success) {
            throw new Error(result.error || "Failed to send email")
        }

        return {
            success: true,
            messageId: result.messageId,
        }
    })
}

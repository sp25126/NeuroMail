import { handleApi } from "@/lib/api-handler"
import { getGmailClient } from "@/lib/gmail"

/**
 * Recursively extract text/plain and text/html from MIME parts.
 * Prefers HTML when available; keeps them separate for the UI to decide.
 */
function extractBodies(payload: any): { bodyText: string; bodyHtml: string } {
    let bodyText = ""
    let bodyHtml = ""

    const walk = (part: any) => {
        if (!part) return

        // Leaf node with data
        if (part.body?.data) {
            const decoded = Buffer.from(part.body.data, "base64").toString("utf-8")
            if (part.mimeType === "text/html" && !bodyHtml) {
                bodyHtml = decoded
            } else if (part.mimeType === "text/plain" && !bodyText) {
                bodyText = decoded
            }
        }

        // Recurse into multipart children
        if (part.parts && Array.isArray(part.parts)) {
            for (const child of part.parts) {
                walk(child)
            }
        }
    }

    walk(payload)
    return { bodyText, bodyHtml }
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    return handleApi({ route: "GET /api/mail/threads/[id]", requireAuth: true }, async (ctx) => {
        const { id } = await params
        const gmail = await getGmailClient()
        const response = await gmail.users.threads.get({
            userId: "me",
            id,
            format: "full",
        })

        const messages = response.data.messages?.map((msg: any) => {
            const headers = msg.payload?.headers || []
            const subject = headers.find((h: any) => h.name === "Subject")?.value || ""
            const from = headers.find((h: any) => h.name === "From")?.value || ""
            const to = headers.find((h: any) => h.name === "To")?.value || ""
            const date = msg.internalDate
                ? new Date(parseInt(msg.internalDate)).toLocaleString()
                : ""

            // Clean MIME extraction — never mash HTML and plain text together
            const { bodyText, bodyHtml } = extractBodies(msg.payload)

            return {
                id: msg.id,
                subject,
                from,
                to,
                date,
                bodyText,  // plain text version
                bodyHtml,  // HTML version (preferred for display)
            }
        })

        return {
            id: response.data.id,
            messages,
        }
    })
}

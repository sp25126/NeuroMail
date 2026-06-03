import { handleApi } from "@/lib/api-handler"
import { getGmailClient } from "@/lib/gmail"

export async function GET(req: Request) {
    return handleApi({ route: "GET /api/mail/threads", requireAuth: true }, async (ctx) => {
        const url = new URL(req.url, "http://localhost:3003")
        const q = url.searchParams.get("q") || "in:inbox"

        console.log("🔍 [API] Fetching threads, query:", q)

        let threads: any[] = [];
        try {
            const gmail = await getGmailClient()

            const response = await gmail.users.threads.list({
                userId: "me",
                maxResults: 20,
                q,
            })

            console.log("📊 [API] Gmail returned:", response.data.threads?.length || 0, "threads")

            threads = await Promise.all(
                (response.data.threads || []).map(async (thread: any) => {
                    const detail = await gmail.users.threads.get({
                        userId: "me",
                        id: thread.id!,
                    })

                    const lastMessage = detail.data.messages?.[detail.data.messages.length - 1]
                    const headers = lastMessage?.payload?.headers || []
                    const subject = headers.find((h: any) => h.name === "Subject")?.value || "No Subject"
                    const from = headers.find((h: any) => h.name === "From")?.value || "Unknown"
                    const to = headers.find((h: any) => h.name === "To")?.value || ""
                    const isUnread = lastMessage?.labelIds?.includes("UNREAD") || false

                    return {
                        id: thread.id,
                        snippet: thread.snippet,
                        subject,
                        sender: from,
                        to,
                        isUnread,
                        date: new Date(parseInt(lastMessage?.internalDate || "0")).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        labels: detail.data.messages?.[0]?.labelIds || [],
                    }
                })
            )

            console.log("✅ [API] Processed", threads.length, "threads")
        } catch (err: any) {
            console.warn("⚠️ [API] Gmail client not initialized or not authorized, returning empty threads list:", err.message)
            threads = []
        }

        return {
            threads,
            count: threads.length,
            query: q,
        }
    })
}

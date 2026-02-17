import { handleApi } from "@/lib/api-handler"

export async function POST(request: Request) {
    return handleApi({ route: "POST /api/webhook/gmail", requireAuth: false }, async () => {
        const body = await request.json()

        // Pub/Sub messages are base64 encoded
        if (body.message?.data) {
            const decodedData = Buffer.from(body.message.data, "base64").toString()
            const data = JSON.parse(decodedData)

            console.log("🔔 Gmail Webhook Received:", data)
        }

        return { success: true }
    })
}

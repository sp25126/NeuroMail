import { getGmailClient } from "./gmail"

export async function setupGmailWatch() {
    try {
        const gmail = await getGmailClient()

        // This requires GMAIL_PUB_SUB_TOPIC to be set in .env.local
        // Format: projects/[PROJECT_ID]/topics/[TOPIC_NAME]
        const topicName = process.env.GMAIL_PUB_SUB_TOPIC

        if (!topicName) {
            console.warn("⚠️ GMAIL_PUB_SUB_TOPIC is not set. Real-time sync will be disabled.")
            return { success: false, error: "GMAIL_PUB_SUB_TOPIC not configured" }
        }

        const response = await gmail.users.watch({
            userId: "me",
            requestBody: {
                topicName,
                labelIds: ["INBOX"], // We only want to watch the inbox for now
            },
        })

        return {
            success: true,
            historyId: response.data.historyId,
            expiration: response.data.expiration,
        }
    } catch (error: any) {
        console.error("Failed to setup Gmail watch:", error)
        // Don't crash the app, just log the error
        return { success: false, error: error.message }
    }
}

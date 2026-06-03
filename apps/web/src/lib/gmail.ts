import { google } from "googleapis"
import { auth } from "./auth"

export async function getGmailClient() {
    const session = await auth()

    console.log("📧 [GMAIL] Creating Gmail client")

    if (!session) {
        console.error("❌ Auth Error: No session found. User might not be logged in.")
        throw new Error("Unauthorized: No session found")
    }

    if (!session.accessToken) {
        console.error("❌ Auth Error: No access token found", { sessionKeys: Object.keys(session) })
        throw new Error("No access token found in session")
    }

    if (session.error) {
        console.error("❌ Auth Error: RefreshTokenError")
        throw new Error("RefreshAccessTokenError")
    }


    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    )

    oauth2Client.setCredentials({
        access_token: session.accessToken,
    })

    console.log("✅ [GMAIL] Client created successfully")
    return google.gmail({ version: "v1", auth: oauth2Client })
}


/**
 * Send an email via Gmail API.
 * Constructs an RFC 2822 message, base64url-encodes it, and sends.
 */
export async function sendEmail(
    to: string,
    subject: string,
    body: string,
    threadId?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
    console.log("📧 [GMAIL] Sending email", { to, subject, hasThreadId: !!threadId })

    try {
        const gmail = await getGmailClient()

        // Construct RFC 2822 email
        const emailLines = [
            `To: ${to}`,
            `Subject: ${subject}`,
            `Content-Type: text/html; charset=utf-8`,
            ``,
            body,
        ]

        const rawMessage = emailLines.join("\r\n")
        const encodedMessage = Buffer.from(rawMessage)
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "")

        const sendParams: any = {
            userId: "me",
            requestBody: { raw: encodedMessage },
        }

        if (threadId) {
            sendParams.requestBody.threadId = threadId
        }

        const response = await gmail.users.messages.send(sendParams)

        console.log("✅ [GMAIL] Email sent successfully", { messageId: response.data.id })
        return { success: true, messageId: response.data.id || undefined }
    } catch (error: any) {
        console.error("❌ [GMAIL] Failed to send email:", error.message)
        return { success: false, error: error.message }
    }
}

import { google } from "googleapis"
import { auth } from "./auth"

const MOCK_THREADS = [
    {
        id: "thread-freight-1",
        snippet: "Notification of shipment arrival for container MSCU1234566. Origin: Shanghai, Destination: Los Angeles.",
        subject: "Shipment Arrival: Container MSCU1234566",
        sender: "notifications@msc-cargo.com",
        to: "dev@neuromail.local",
        date: new Date(Date.now() - 3600000 * 2).toISOString(), // 2 hours ago
        isUnread: true,
        isStarred: true,
        bodyText: "Dear Customer,\n\nPlease find the arrival details for container MSCU1234566.\nOrigin: Port of Shanghai\nDestination: Port of Los Angeles\nETA: 2026-06-05\nLast Free Day: 2026-06-10\nCarrier: MSC\n\nBest Regards,\nMSC Logistics Service",
        bodyHtml: "<p>Dear Customer,</p><p>Please find the arrival details for container <strong>MSCU1234566</strong>.</p><ul><li>Origin: Port of Shanghai</li><li>Destination: Port of Los Angeles</li><li>ETA: 2026-06-05</li><li>Last Free Day: 2026-06-10</li><li>Carrier: MSC</li></ul><p>Best Regards,<br>MSC Logistics Service</p>"
    },
    {
        id: "thread-freight-2",
        snippet: "Booking confirmation for container CSQU3054383. Ready for gate-in at Port of Hamburg.",
        subject: "Booking Confirmation: CSQU3054383",
        sender: "bookings@cosco-shipping.com",
        to: "dev@neuromail.local",
        date: new Date(Date.now() - 3600000 * 24).toISOString(), // 1 day ago
        isUnread: false,
        isStarred: false,
        bodyText: "Dear Client,\n\nYour booking is confirmed. Details:\nContainer: CSQU3054383\nBooking Reference: COSCO-Hamburg-992\nPort of Loading: Port of Hamburg\nPort of Discharge: Port of New York\nETA: 2026-06-12\nLast Free Day: 2026-06-18\n\nThank you for choosing COSCO.",
        bodyHtml: "<p>Dear Client,</p><p>Your booking is confirmed. Details:</p><ul><li>Container: <strong>CSQU3054383</strong></li><li>Booking Reference: COSCO-Hamburg-992</li><li>Port of Loading: Port of Hamburg</li><li>Port of Discharge: Port of New York</li><li>ETA: 2026-06-12</li><li>Last Free Day: 2026-06-18</li></ul><p>Thank you for choosing COSCO.</p>"
    },
    {
        id: "thread-normal-1",
        snippet: "Hi Team, let's schedule a follow-up meeting this Thursday at 2 PM EST to discuss the freight service rollout.",
        subject: "Follow-up meeting: Freight module rollout",
        sender: "john.doe@neuromail.local",
        to: "dev@neuromail.local",
        date: new Date(Date.now() - 3600000 * 4).toISOString(), // 4 hours ago
        isUnread: true,
        isStarred: false,
        bodyText: "Hi Team,\n\nLet's schedule a follow-up meeting this Thursday at 2 PM EST to discuss the freight service rollout plans.\n\nThanks,\nJohn",
        bodyHtml: "<p>Hi Team,</p><p>Let's schedule a follow-up meeting this Thursday at 2 PM EST to discuss the freight service rollout plans.</p><p>Thanks,<br>John</p>"
    },
    {
        id: "thread-normal-2",
        snippet: "Weekly digest: 5 updates in Github repo, new documentation for the ingestion pipeline is now available.",
        subject: "Weekly Digest: GitHub updates and ingestion docs",
        sender: "github-notifications@neuromail.local",
        to: "dev@neuromail.local",
        date: new Date(Date.now() - 3600000 * 48).toISOString(), // 2 days ago
        isUnread: false,
        isStarred: true,
        bodyText: "Hi,\n\nHere is your weekly digest:\n- 5 updates merged in the freight-service branch.\n- New documentation for the ingestion pipeline is available in docs/ingestion-pipeline.md.\n\nHave a great week!",
        bodyHtml: "<p>Hi,</p><p>Here is your weekly digest:</p><ul><li>5 updates merged in the freight-service branch.</li><li>New documentation for the ingestion pipeline is available in <code>docs/ingestion-pipeline.md</code>.</li></ul><p>Have a great week!</p>"
    }
]

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

    // Return a Mock Gmail Client for local development/credentials login
    if (session.accessToken === "mock-access-token" || process.env.GOOGLE_CLIENT_ID?.includes("your_client_id_here")) {
        console.log("🎮 [GMAIL] Returning mock Gmail client for local development")
        return {
            users: {
                threads: {
                    list: async (params: any) => {
                        const q = params.q || ""
                        console.log("🎮 [MOCK GMAIL] list threads query:", q)
                        
                        let filtered = MOCK_THREADS
                        if (q.includes("is:starred") || q.includes("starred")) {
                            filtered = MOCK_THREADS.filter(t => t.isStarred)
                        } else if (q.includes("is:unread") || q.includes("unread")) {
                            filtered = MOCK_THREADS.filter(t => t.isUnread)
                        } else if (q.includes("in:sent") || q.includes("sent")) {
                            filtered = []
                        } else if (q.includes("in:draft") || q.includes("draft")) {
                            filtered = []
                        } else if (q.includes("in:trash") || q.includes("trash")) {
                            filtered = []
                        }
                        
                        return {
                            data: {
                                threads: filtered.map(t => ({
                                    id: t.id,
                                    snippet: t.snippet
                                }))
                            }
                        }
                    },
                    get: async (params: any) => {
                        const threadId = params.id
                        console.log("🎮 [MOCK GMAIL] get thread:", threadId)
                        const thread = MOCK_THREADS.find(t => t.id === threadId) || MOCK_THREADS[0]
                        
                        return {
                            data: {
                                id: thread.id,
                                messages: [
                                    {
                                        id: `msg-${thread.id}`,
                                        internalDate: String(new Date(thread.date).getTime()),
                                        snippet: thread.snippet,
                                        payload: {
                                            headers: [
                                                { name: "Subject", value: thread.subject },
                                                { name: "From", value: thread.sender },
                                                { name: "To", value: thread.to },
                                                { name: "Date", value: thread.date }
                                            ],
                                            mimeType: "multipart/alternative",
                                            body: { data: "" },
                                            parts: [
                                                {
                                                    mimeType: "text/plain",
                                                    body: {
                                                        data: Buffer.from(thread.bodyText).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
                                                    }
                                                },
                                                {
                                                    mimeType: "text/html",
                                                    body: {
                                                        data: Buffer.from(thread.bodyHtml).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
                                                    }
                                                }
                                            ]
                                        }
                                    }
                                ]
                            }
                        }
                    }
                },
                messages: {
                    send: async (params: any) => {
                        console.log("🎮 [MOCK GMAIL] send message:", params)
                        return {
                            data: {
                                id: `msg-sent-${Math.random().toString(36).substring(7)}`,
                                threadId: params.requestBody?.threadId || `thread-sent-${Math.random().toString(36).substring(7)}`
                            }
                        }
                    }
                }
            }
        } as any
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

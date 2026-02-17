import { generateLLMResponse, getLLMConfig } from "@/lib/llm";
import { getGmailClient } from "@/lib/gmail";
import { handleApi } from "@/lib/api-handler";

export async function POST(req: Request) {
    return handleApi({ route: "POST /api/ai/analyze-style", requireAuth: true }, async (ctx) => {
        const gmail = await getGmailClient();
        const llmConfig = getLLMConfig(ctx.userEmail);

        // Fetch last 20 sent emails
        const response = await gmail.users.messages.list({
            userId: "me",
            labelIds: ["SENT"],
            maxResults: 20,
        });

        if (!response.data.messages) {
            return { profile: "No sent emails found to analyze." };
        }

        const sentEmails = await Promise.all(
            response.data.messages.map(async (msg) => {
                const detail = await gmail.users.messages.get({ userId: "me", id: msg.id! });
                return detail.data.snippet;
            })
        );

        const { text } = await generateLLMResponse(llmConfig, {
            userPrompt: `
Analyze these 20 email snippets written by the user.
Identify their writing style, tone, common phrases, and formatting habits.

Emails:
${sentEmails.join("\n---\n")}

Output a concise "Style Profile" (max 50 words) that describes how they write.
Example: "Formal and direct. Uses bullet points often. Never uses emojis. Starts with 'Hi [Name]'."
`,
        });

        return { profile: text };
    });
}

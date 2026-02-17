import { generateLLMResponse, getLLMConfig } from "@/lib/llm"
import { getGmailClient } from "@/lib/gmail"
import { handleApi } from "@/lib/api-handler"
import { getPreferenceByEmail } from "@/lib/storage"

export async function POST(req: Request) {
    return handleApi({ route: "POST /api/ai/draft", requireAuth: true }, async (ctx) => {
        const { prompt, context } = await req.json()
        const llmConfig = getLLMConfig(ctx.userEmail);

        // Load user preferences
        const prefs = getPreferenceByEmail(ctx.userEmail);
        const personaInfo = prefs
            ? `Write as: Persona="${prefs.persona}", Tone="${prefs.tone}", Length="${prefs.length}"`
            : `Write as: Persona="professional", Tone="friendly", Length="medium"`;

        // Search Gmail for context about the request
        let gmailContext = "";
        try {
            const gmail = await getGmailClient();
            const searchTerms = prompt.replace(/draft|email|write|send|compose|an|to|about|the|for|a/gi, '').trim();

            if (searchTerms) {
                const threadsRes = await gmail.users.threads.list({
                    userId: "me",
                    q: searchTerms,
                    maxResults: 3,
                });

                if (threadsRes.data.threads) {
                    const details = await Promise.all(
                        threadsRes.data.threads.map(async (t) => {
                            try {
                                const detail = await gmail.users.threads.get({ userId: "me", id: t.id! });
                                const lastMsg = detail.data.messages?.[detail.data.messages.length - 1];
                                return {
                                    from: lastMsg?.payload?.headers?.find(h => h.name === "From")?.value,
                                    to: lastMsg?.payload?.headers?.find(h => h.name === "To")?.value,
                                    subject: lastMsg?.payload?.headers?.find(h => h.name === "Subject")?.value,
                                    snippet: detail.data.messages?.[0]?.snippet,
                                };
                            } catch { return null; }
                        })
                    );

                    gmailContext = details.filter(Boolean)
                        .map(d => `From: ${d!.from}\nTo: ${d!.to}\nSubject: ${d!.subject}\nSnippet: ${d!.snippet}`)
                        .join("\n---\n");
                }
            }
        } catch (e) {
            console.error("[POST /api/ai/draft] Gmail context fetch error:", e);
        }

        const systemPrompt = `
You are an intelligent email assistant with control over the user's interface.
You are CONTEXT-AWARE: you use REAL data from the user's Gmail to make informed decisions.

${personaInfo}
User's email: ${ctx.userEmail}

REAL CONTEXT FROM USER'S GMAIL:
${gmailContext || "No matching emails found."}

You can perform the following actions by outputting a JSON object (and NOTHING else):

1. **Compose Email**:
   { "action": "compose", "to": "REAL_EMAIL@domain.com", "subject": "Subject", "body": "Body content..." }
   RULES:
   - Use REAL email addresses from the Gmail context above. NEVER use "example.com".
   - Reference real details from past conversations when relevant.
   - Match the user's preferred persona, tone, and length.

2. **Search/Filter Emails**:
   { "action": "search", "query": "label:inbox last week" }

3. **Chat/Answer**:
   { "action": "chat", "response": "Your answer here..." }

4. **Propose New Custom Skill**:
   { 
     "action": "propose_feature", 
     "name": "skill_name", 
     "description": "What it does",
     "user_message": "I can learn to do this for you. Want me to?"
   }

Current Context:
${context || "No context"}
User Request: "${prompt}"

Respond ONLY with valid JSON. Use REAL data, never generic placeholders.
`

        const { text } = await generateLLMResponse(llmConfig, {
            systemPrompt,
            userPrompt: "Execute command.",
        })

        const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim()
        return JSON.parse(cleanText)
    })
}

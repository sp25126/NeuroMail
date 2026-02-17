import { generateLLMResponse, getLLMConfig } from "@/lib/llm";
import { getGmailClient } from "@/lib/gmail";
import { handleApi } from "@/lib/api-handler";
import { getPreferenceByEmail } from "@/lib/storage";

// Helper: Search Gmail for context
async function searchGmail(query: string) {
    try {
        const gmail = await getGmailClient();
        const threadsRes = await gmail.users.threads.list({
            userId: "me",
            q: query,
            maxResults: 5,
        });

        const threadDetails = await Promise.all(
            (threadsRes.data.threads || []).map(async (t) => {
                try {
                    const detail = await gmail.users.threads.get({ userId: "me", id: t.id! });
                    const lastMsg = detail.data.messages?.[detail.data.messages.length - 1];
                    const firstMsg = detail.data.messages?.[0];
                    return {
                        snippet: firstMsg?.snippet,
                        from: lastMsg?.payload?.headers?.find(h => h.name === "From")?.value,
                        to: lastMsg?.payload?.headers?.find(h => h.name === "To")?.value,
                        subject: lastMsg?.payload?.headers?.find(h => h.name === "Subject")?.value,
                        date: lastMsg?.payload?.headers?.find(h => h.name === "Date")?.value,
                    };
                } catch { return null; }
            })
        );

        return threadDetails.filter(Boolean);
    } catch (e) {
        console.error("[POST /api/ai/query] Gmail search error:", e);
        return [];
    }
}

// Helper: Extract real email addresses from Gmail results
function extractEmails(results: any[], nameHint: string): string[] {
    const emails: string[] = [];
    const lowerHint = nameHint.toLowerCase();

    for (const r of results) {
        if (!r) continue;
        for (const field of [r.from, r.to]) {
            if (!field) continue;
            const match = field.match(/<([^>]+)>/);
            const email = match ? match[1] : field;
            const name = field.replace(/<[^>]+>/, '').trim().toLowerCase();

            if (name.includes(lowerHint) || email.toLowerCase().includes(lowerHint)) {
                if (!emails.includes(email)) emails.push(email);
            }
        }
    }
    return emails;
}

export async function POST(req: Request) {
    return handleApi({ route: "POST /api/ai/query", requireAuth: true }, async (ctx) => {
        const { prompt, context } = await req.json();
        const llmConfig = getLLMConfig(ctx.userEmail);

        // Load user preferences for personalization
        const prefs = getPreferenceByEmail(ctx.userEmail);
        const personaInfo = prefs
            ? `User Preferences: Persona="${prefs.persona}", Tone="${prefs.tone}", Length="${prefs.length}"`
            : `User Preferences: Persona="professional", Tone="friendly", Length="medium"`;

        // Step 1: ALWAYS search Gmail for context before making decisions
        const searchQueries: string[] = [];
        const nameRegex = /\b(?:to|from|about|with|for)\s+(\w+)/gi;
        let nameMatch;
        while ((nameMatch = nameRegex.exec(prompt)) !== null) {
            searchQueries.push(nameMatch[1]);
        }
        if (searchQueries.length === 0) {
            searchQueries.push(prompt.slice(0, 50));
        }

        let gmailContext = "";
        let foundEmails: string[] = [];

        for (const query of searchQueries) {
            const results = await searchGmail(query);
            if (results.length > 0) {
                const emails = extractEmails(results, query);
                foundEmails.push(...emails);
                gmailContext += results
                    .map(d => `From: ${d!.from}\nTo: ${d!.to}\nSubject: ${d!.subject}\nDate: ${d!.date}\nSnippet: ${d!.snippet}`)
                    .join("\n\n---\n\n");
            }
        }

        foundEmails = [...new Set(foundEmails)];

        // Step 2: Generate response with FULL context
        const intentPrompt = `
You are a Master AI Copilot for an email application. You are CONTEXT-AWARE and AGENTIC.
You ALWAYS use the user's real data to make informed decisions. NEVER make up email addresses or generic content.

${personaInfo}
User's Email: ${ctx.userEmail}

REAL DATA FROM USER'S GMAIL:
${gmailContext || "No matching emails found in Gmail."}

KNOWN EMAIL ADDRESSES FOUND:
${foundEmails.length > 0 ? foundEmails.join(", ") : "None found - use your best judgment"}

BOUNDARIES:
- You have full access to emails, search, and composition.
- You DO NOT have access to user profiles or final task submission systems.
- If asked about these, politely explain you lack authorization.

ACTIONS you can perform (Respond ONLY with valid JSON):

1. **Compose**: { "action": "compose", "to": "REAL_EMAIL@domain.com", "subject": "...", "body": "..." }
   RULES FOR COMPOSE:
   - ALWAYS use a REAL email address from the Gmail data above. NEVER use "example.com".
   - Write the body using the user's preferred persona, tone, and length.
   - Reference REAL details from past conversations when relevant.
   - Make the email feel personal, not generic.
   - If the user says "reply to this" and there is UI context, compose a reply using that context.

2. **Search UI**: { "action": "search", "query": "..." }

3. **Direct Chat**: { "action": "chat", "response": "..." }

4. **Data Retrieval**: { "action": "retrieve", "query": "gmail search query", "thinking": "Why I need more data" }

5. **Propose Skill**: { "action": "propose_feature", "name": "...", "description": "...", "user_message": "..." }

6. **Open Thread**: { "action": "open_thread", "search_query": "from:person OR subject:topic", "response": "Opening latest email from..." }
   Use when user says "open latest from X", "show me that email from Y", "go to the email about Z"
   The search_query should be a valid Gmail search query that will find the specific thread.

7. **Filter Inbox**: { "action": "filter", "query": "gmail search query", "label": "Short human label", "response": "Showing..." }
   Use when user says "show emails from last week", "show only unread", "emails from this month", etc.
   Common Gmail queries: newer_than:7d, is:unread newer_than:7d, newer_than:30d, from:someone, has:attachment
   The label should be short and descriptive like "Last 7 days", "Unread this week", "From Google".

Current UI Context:
${context || "No specific context provided"}

User Request: "${prompt}"

CRITICAL: Use the REAL data above. If you found email addresses, USE THEM. Be specific, not generic.
`;

        const { text: intentText } = await generateLLMResponse(llmConfig, {
            userPrompt: intentPrompt,
        });

        const intent = JSON.parse(intentText.replace(/```json/g, "").replace(/```/g, "").trim());

        // Step 3: Handle Retrieval
        if (intent.action === "retrieve") {
            const results = await searchGmail(intent.query);
            const contextData = results
                .map(d => `From: ${d!.from}\nTo: ${d!.to}\nSubject: ${d!.subject}\nDate: ${d!.date}\nSnippet: ${d!.snippet}`)
                .join("\n\n---\n\n");

            const { text: finalAnswer } = await generateLLMResponse(llmConfig, {
                systemPrompt: "You are an intelligent email assistant. Answer based on real Gmail data.",
                userPrompt: `${personaInfo}\n\nResults:\n${contextData || "No relevant emails found."}\n\nUser Question: "${prompt}"`,
            });

            return { action: "chat", response: finalAnswer };
        }

        return intent;
    });
}

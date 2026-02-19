import { generateLLMResponse, getLLMConfig } from "@/agent/llm"
import { handleApi } from "@/lib/api-handler"

export async function POST(req: Request) {
    return handleApi({ route: "POST /api/ai/summarize", requireAuth: true }, async (ctx) => {
        const { messages } = await req.json()
        const llmConfig = await getLLMConfig(ctx.userEmail);

        if (!messages || !Array.isArray(messages)) {
            const error = new Error("Messages are required");
            (error as any).status = 400;
            throw error;
        }

        const fullContent = messages
            .map((m: any) => `From: ${m.from}\nDate: ${m.date}\nContent: ${m.body}`)
            .join("\n\n---\n\n")

        const { text } = await generateLLMResponse(llmConfig, {
            systemPrompt: "You are an expert email assistant. Provide a concise, professional summary of the following email thread. Highlight key decisions, action items, and the overall tone. Use bullet points.",
            userPrompt: fullContent,
        })

        return { summary: text }
    })
}

import { handleApi } from "@/lib/api-handler";
import fs from "fs/promises";
import path from "path";

const REGISTRY_PATH = path.join(process.cwd(), "src/lib/registry.json");

// Ensure registry file exists
async function ensureRegistry() {
    try {
        await fs.access(REGISTRY_PATH);
    } catch {
        await fs.writeFile(REGISTRY_PATH, JSON.stringify({ functions: [] }, null, 2));
    }
}

export async function GET() {
    return handleApi({ route: "GET /api/ai/registry", requireAuth: false }, async () => {
        await ensureRegistry();
        const data = await fs.readFile(REGISTRY_PATH, "utf-8");
        return JSON.parse(data);
    });
}

export async function POST(req: Request) {
    return handleApi({ route: "POST /api/ai/registry", requireAuth: true }, async (ctx) => {
        await ensureRegistry();
        const newFunction = await req.json();
        const data = await fs.readFile(REGISTRY_PATH, "utf-8");
        const registry = JSON.parse(data);

        // Prevent duplicates by name
        const exists = registry.functions.find((f: any) => f.name === newFunction.name);
        if (!exists) {
            registry.functions.push({
                ...newFunction,
                createdAt: new Date().toISOString(),
            });
            await fs.writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2));
        }

        return { success: true, registry };
    });
}

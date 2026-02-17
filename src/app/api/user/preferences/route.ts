import { handleApi } from "@/lib/api-handler";
import { getPreferenceByEmail, updatePreference } from "@/lib/storage";

export async function GET() {
    return handleApi({ route: "GET /api/user/preferences", requireAuth: true }, async (ctx) => {
        let preference = getPreferenceByEmail(ctx.userEmail);

        if (!preference) {
            // Create default preferences for new users
            preference = updatePreference(ctx.userEmail, {
                persona: "professional",
                tone: "default",
                length: "medium",
            });
        }

        return preference;
    });
}

export async function PATCH(req: Request) {
    return handleApi({ route: "PATCH /api/user/preferences", requireAuth: true }, async (ctx) => {
        const { persona, tone, length } = await req.json();
        const updated = updatePreference(ctx.userEmail, { persona, tone, length });
        return updated;
    });
}

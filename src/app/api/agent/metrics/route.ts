import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { metrics } from "@/agent/observability/logger";

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Only expose metrics to admins in production
        // Note: session.user.isAdmin check depends on your auth implementation
        if (process.env.NODE_ENV === "production" && !(session.user as any).isAdmin) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        const metricsData = metrics.getMetrics();

        return Response.json(metricsData);
    } catch (error: any) {
        return Response.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

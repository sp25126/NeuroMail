import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

interface ApiHandlerOptions {
    /** Route name for logging, e.g. "GET /api/mail/threads" */
    route: string;
    /** Whether this route requires authentication */
    requireAuth?: boolean;
}

interface AuthenticatedContext {
    session: {
        user?: { email?: string; name?: string; image?: string };
        accessToken?: string;
        error?: string;
        expires?: string;
    };
    userEmail: string;
}

/**
 * Unified API error handler. Wraps any route handler with:
 * 1. Structured error logging (route, message, stack)
 * 2. Optional auth guard
 * 3. Consistent JSON error responses
 */
export async function handleApi<T>(
    options: ApiHandlerOptions,
    fn: (ctx: AuthenticatedContext) => Promise<T>
): Promise<NextResponse> {
    const startTime = Date.now();

    try {
        // Auth guard
        if (options.requireAuth !== false) {
            const session = await auth();

            if (!session) {
                console.warn(`[${options.route}] ⛔ No session — returning 401`);
                return NextResponse.json(
                    { error: "Unauthorized", route: options.route },
                    { status: 401 }
                );
            }

            const userEmail = (session as any).user?.email || "";

            if (!userEmail && options.requireAuth) {
                console.warn(`[${options.route}] ⛔ Session exists but no email — JWT callback may be broken`);
                return NextResponse.json(
                    { error: "Session missing email. Please sign out and sign back in.", route: options.route },
                    { status: 401 }
                );
            }

            const ctx: AuthenticatedContext = {
                session: session as any,
                userEmail,
            };

            const data = await fn(ctx);
            const duration = Date.now() - startTime;
            console.log(`[${options.route}] ✅ ${duration}ms`);

            if (data instanceof NextResponse) return data;
            return NextResponse.json(data);
        }

        // No auth required
        const ctx: AuthenticatedContext = {
            session: {} as any,
            userEmail: "",
        };

        const data = await fn(ctx);
        const duration = Date.now() - startTime;
        console.log(`[${options.route}] ✅ ${duration}ms`);

        if (data instanceof NextResponse) return data;
        return NextResponse.json(data);

    } catch (err: any) {
        const duration = Date.now() - startTime;

        // Structured error logging — this is the "no more guessing" part
        console.error(`[${options.route}] ❌ FAILED after ${duration}ms`, {
            message: err?.message,
            name: err?.name,
            code: err?.code,
            status: err?.status || err?.statusCode,
            stack: err?.stack?.split("\n").slice(0, 5).join("\n"), // First 5 lines of stack
            cause: err?.cause ? String(err.cause) : undefined,
        });

        // Determine appropriate status code
        const statusCode = err?.status || err?.statusCode || 500;
        const isClientError = statusCode >= 400 && statusCode < 500;

        return NextResponse.json(
            {
                error: isClientError ? err.message : "Internal Server Error",
                route: options.route,
                // Only include details in dev mode
                ...(process.env.NODE_ENV === "development" && {
                    details: err.message,
                    stack: err.stack?.split("\n").slice(0, 3),
                }),
            },
            { status: statusCode }
        );
    }
}

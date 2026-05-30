import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function GET() {
    const session = await auth()
    if (!session) return NextResponse.json({ authenticated: false })

    // Redact sensitive info but keep keys for debugging
    const debugSession = {
        authenticated: true,
        keys: Object.keys(session),
        userKeys: session.user ? Object.keys(session.user) : null,
        hasAccessToken: !!session.accessToken,
        accessTokenLength: session.accessToken?.length || 0,
        expires: session.expires,
    }

    return NextResponse.json(debugSession)
}

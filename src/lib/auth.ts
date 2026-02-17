import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
                params: {
                    scope: "openid email profile https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send",
                    access_type: "offline",
                    prompt: "consent",
                },
            },
        }),
    ],
    callbacks: {
        async jwt({ token, account }) {
            // Initial sign in
            if (account) {
                console.log("🔑 JWT Callback: Account detected, saving accessToken")
                return {
                    ...token, // CRITICAL: preserve email, name, picture from the provider
                    sub: account.providerAccountId, // Ensure sub is set
                    accessToken: account.access_token,
                    expiresAt: account.expires_at,
                    refreshToken: account.refresh_token,
                    error: undefined,
                }
            }

            // Return previous token if the access token has not expired yet
            if (Date.now() < (token.expiresAt as number) * 1000) {
                return token
            }

            // Access token has expired, try to update it
            console.log("🔄 Access Token has expired, refreshing...")
            try {
                // We need to import google here dynamically or use fetch to refresh
                // Using fetch is often simpler for NextAuth rotation without circular deps
                const response = await fetch("https://oauth2.googleapis.com/token", {
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({
                        client_id: process.env.GOOGLE_CLIENT_ID!,
                        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
                        grant_type: "refresh_token",
                        refresh_token: token.refreshToken as string,
                    }),
                    method: "POST",
                })

                const tokens = await response.json()

                if (!response.ok) throw tokens

                return {
                    ...token,
                    accessToken: tokens.access_token,
                    expiresAt: Math.floor(Date.now() / 1000 + tokens.expires_in),
                    refreshToken: tokens.refresh_token ?? token.refreshToken, // Fallback to old refresh token
                }
            } catch (error) {
                console.error("Error refreshing access token", error)
                return {
                    ...token,
                    error: "RefreshAccessTokenError",
                }
            }
        },
        async session({ session, token }) {
            return {
                ...session,
                user: {
                    ...session.user,
                    id: token.sub as string,
                },
                sessionId: (token.jti || token.sub) as string,
                accessToken: token.accessToken as string,
                error: token.error as string,
            }
        },
    },
})

import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function MailPage() {
    const session = await auth()
    if (!session) {
        redirect("/api/auth/signin")
    }
    return null; // Layout handles the rendering based on view state
}

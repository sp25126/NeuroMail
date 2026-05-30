import { auth } from "@/lib/auth"
import { HomeClient } from "@/components/mail/HomeClient"
import { redirect } from "next/navigation"
import { getProviderLabel } from "@/lib/llm"

export default async function Home() {
  const session = await auth()

  if (session) {
    redirect("/mail")
  }

  redirect("/api/auth/signin")
}

import { redirect } from "next/navigation"

import { MessagesInbox } from "@/components/messages/messages"
import { getSession } from "@/lib/auth"

export default async function MessagesPage() {
  const session = await getSession()
  if (!session) redirect("/sign-in")
  if (!session.onboardingComplete) redirect("/onboarding")

  return <MessagesInbox />
}

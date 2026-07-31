import { redirect } from "next/navigation"

import { DirectConversation } from "@/components/messages/messages"
import { getSession } from "@/lib/auth"

export default async function DirectConversationPage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  const session = await getSession()
  if (!session) redirect("/sign-in")
  if (!session.onboardingComplete) redirect("/onboarding")

  return <DirectConversation username={username} />
}

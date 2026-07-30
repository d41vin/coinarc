import { redirect } from "next/navigation"

import { getSession } from "@/lib/auth"
import { sessionState } from "@/lib/convex-server"

export default async function ProfilePage() {
  const session = await getSession()
  if (!session) redirect("/sign-in")
  if (!session.onboardingComplete) redirect("/onboarding")

  const profile = await sessionState(session)
  if (!profile?.username) redirect("/onboarding")

  redirect(`/profile/${profile.username}`)
}

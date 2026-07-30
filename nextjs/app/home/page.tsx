import { redirect } from "next/navigation"

import { getSession } from "@/lib/auth"
import { sessionState } from "@/lib/convex-server"
import { HomeDashboard } from "./home-dashboard"

export default async function HomePage() {
  const session = await getSession()
  if (!session) redirect("/sign-in")
  if (!session.onboardingComplete) redirect("/onboarding")

  let displayName = session.email?.split("@")[0] || "there"

  try {
    const profile = await sessionState(session)
    displayName = profile?.displayName || displayName
  } catch (reason) {
    // The navigation and page shell should stay available if Convex is
    // temporarily unavailable. The dashboard can still recover its live data.
    console.error("Could not load the authenticated home profile", reason)
  }

  return <HomeDashboard displayName={displayName} />
}

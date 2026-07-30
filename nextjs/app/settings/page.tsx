import { redirect } from "next/navigation"

import { CoinArcConvexProvider } from "@/components/convex-provider"
import { getSession } from "@/lib/auth"
import { SettingsForm } from "./settings-form"

export default async function SettingsPage() {
  const session = await getSession()
  if (!session) redirect("/sign-in")
  if (!session.onboardingComplete) redirect("/onboarding")

  return (
    <CoinArcConvexProvider>
      <SettingsForm email={session.email} />
    </CoinArcConvexProvider>
  )
}

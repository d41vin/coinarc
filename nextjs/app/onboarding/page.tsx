import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { CoinArcConvexProvider } from "@/components/convex-provider"
import { OnboardingForm } from "./onboarding-form"
export default async function OnboardingPage() {
  const session = await getSession()
  if (!session) redirect("/sign-in")
  if (session.onboardingComplete) redirect("/home")
  return (
    <CoinArcConvexProvider>
      <OnboardingForm />
    </CoinArcConvexProvider>
  )
}

import { redirect } from "next/navigation"

import { CoinArcConvexProvider } from "@/components/convex-provider"
import { getSession } from "@/lib/auth"
import { FriendsList } from "./friends-list"

export default async function FriendsPage() {
  const session = await getSession()
  if (!session) redirect("/sign-in")
  if (!session.onboardingComplete) redirect("/onboarding")

  return (
    <CoinArcConvexProvider>
      <FriendsList />
    </CoinArcConvexProvider>
  )
}

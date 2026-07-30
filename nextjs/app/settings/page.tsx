import { redirect } from "next/navigation"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getSession } from "@/lib/auth"
import { sessionState } from "@/lib/convex-server"

function initials(displayName: string | undefined) {
  return (
    displayName
      ?.trim()
      .split(/\s+/)
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  )
}

export default async function SettingsPage() {
  const session = await getSession()
  if (!session) redirect("/sign-in")
  if (!session.onboardingComplete) redirect("/onboarding")

  const profile = await sessionState(session)
  if (!profile) redirect("/sign-in")

  return (
    <main className="mx-auto min-h-[calc(100svh-4rem)] w-full max-w-2xl p-4 sm:p-6">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-muted-foreground">
            Your CoinArc account details.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Profile editing will be added as CoinArc’s account settings grow.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <Avatar className="size-16" size="lg">
              {profile.avatarUrl ? (
                <AvatarImage alt="" src={profile.avatarUrl} />
              ) : null}
              <AvatarFallback className="bg-primary text-lg text-primary-foreground">
                {initials(profile.displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">{profile.displayName}</p>
              <p className="truncate text-sm text-muted-foreground">
                @{profile.username}
              </p>
              {session.email ? (
                <p className="truncate text-sm text-muted-foreground">
                  {session.email}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

import Link from "next/link"
import { Pencil } from "lucide-react"
import { redirect } from "next/navigation"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
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

export default async function ProfilePage() {
  const session = await getSession()
  if (!session) redirect("/sign-in")
  if (!session.onboardingComplete) redirect("/onboarding")

  const profile = await sessionState(session)
  if (!profile) redirect("/onboarding")

  return (
    <main className="mx-auto min-h-[calc(100svh-4rem)] w-full max-w-2xl p-4 sm:p-6">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
            <p className="mt-1 text-muted-foreground">
              Your CoinArc identity and payment profile.
            </p>
          </div>
          <Button render={<Link href="/settings" />} variant="outline">
            <Pencil />
            Edit profile
          </Button>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center gap-4 pt-6 text-center sm:flex-row sm:text-left">
            <Avatar className="size-24" size="lg">
              {profile.avatarUrl ? (
                <AvatarImage alt="" src={profile.avatarUrl} />
              ) : null}
              <AvatarFallback className="bg-primary text-2xl text-primary-foreground">
                {initials(profile.displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold tracking-tight">
                {profile.displayName}
              </h2>
              {profile.username ? (
                <p className="mt-1 text-muted-foreground">
                  @{profile.username}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment profile</CardTitle>
            <CardDescription>
              Your public payment link and activity will live here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Public profile sharing and payment activity are coming next.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

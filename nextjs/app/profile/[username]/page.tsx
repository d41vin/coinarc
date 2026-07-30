import { notFound } from "next/navigation"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { getSession } from "@/lib/auth"
import { getPublicProfile } from "@/lib/convex-server"
import { ProfileActions } from "./profile-actions"

function initials(displayName: string) {
  return displayName
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}â€¦${address.slice(-4)}`
}

export default async function PublicProfilePage({
  params,
}: PageProps<"/profile/[username]">) {
  const { username } = await params
  const session = await getSession()
  const profile = await getPublicProfile(username, session)
  if (!profile) notFound()

  const canConnect = Boolean(session?.onboardingComplete)

  return (
    <main className="mx-auto min-h-[calc(100svh-4rem)] w-full max-w-2xl p-4 sm:p-6">
      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-5 pt-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Avatar className="size-24" size="lg">
                {profile.avatarUrl ? (
                  <AvatarImage alt="" src={profile.avatarUrl} />
                ) : null}
                <AvatarFallback className="bg-primary text-2xl text-primary-foreground">
                  {initials(profile.displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-semibold tracking-tight">
                    {profile.displayName}
                  </h1>
                  <Badge variant="secondary">Public profile</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">
                  @{profile.username}
                </p>
                {profile.walletAddress ? (
                  <p className="mt-3 font-mono text-sm text-muted-foreground">
                    Primary wallet: {shortAddress(profile.walletAddress)}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No receiving wallet is available yet.
                  </p>
                )}
              </div>
            </div>
            <ProfileActions
              canConnect={canConnect}
              isOwner={profile.isOwner}
              isSignedIn={Boolean(session)}
              username={profile.username}
              walletAddress={profile.walletAddress}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Public groups</CardTitle>
            <CardDescription>
              Groups this person chooses to share publicly will appear here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Empty className="min-h-48">
              <EmptyHeader>
                <EmptyTitle>No public groups yet</EmptyTitle>
                <EmptyDescription>
                  Public group cards will be shown here once groups are
                  available.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

import { UsersRound } from "lucide-react"
import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { getSession } from "@/lib/auth"

export default async function GroupsPage() {
  const session = await getSession()
  if (!session) redirect("/sign-in")
  if (!session.onboardingComplete) redirect("/onboarding")

  return (
    <main className="mx-auto min-h-[calc(100svh-4rem)] w-full max-w-4xl p-4 sm:p-6">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Groups</h1>
          <p className="mt-1 text-muted-foreground">
            A shared space for the people and payments that matter to you.
          </p>
        </div>

        <Empty className="min-h-80 bg-card shadow-sm ring-1 ring-foreground/5">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersRound />
            </EmptyMedia>
            <EmptyTitle>Your groups will appear here</EmptyTitle>
            <EmptyDescription>
              Group creation, membership, and shared payment activity are being
              prepared for CoinArc.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button disabled type="button">
              Create a group
            </Button>
            <p className="text-xs text-muted-foreground">
              This action will be available when groups launch.
            </p>
          </EmptyContent>
        </Empty>
      </div>
    </main>
  )
}

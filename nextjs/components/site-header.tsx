import Link from "next/link"

import { SiteHeaderActions } from "@/components/site-header-actions"
import { getSession } from "@/lib/auth"
import { sessionState } from "@/lib/convex-server"

export async function SiteHeader() {
  const session = await getSession()
  const profile = session ? await sessionState(session) : null

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          className="text-lg font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          href="/"
        >
          CoinArc
        </Link>
        <SiteHeaderActions
          profile={
            profile
              ? {
                  avatarUrl: profile.avatarUrl,
                  displayName: profile.displayName,
                  username: profile.username,
                }
              : null
          }
          session={session}
        />
      </div>
    </header>
  )
}

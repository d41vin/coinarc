"use client"

import Link from "next/link"
import {
  LogOut,
  Moon,
  Settings,
  Sun,
  UserRound,
  UserPlus,
  UsersRound,
} from "lucide-react"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { useState, useSyncExternalStore } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Session } from "@/lib/auth"
import { UserSearch } from "@/components/user-search"

type SiteHeaderActionsProps = {
  profile: {
    avatarUrl?: string
    displayName?: string
    username?: string
  } | null
  session: Session | null
}

const emptySubscribe = () => () => {}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )

  if (!mounted) {
    return <div aria-hidden className="size-9" />
  }

  const isDark = resolvedTheme === "dark"

  return (
    <Button
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      size="icon"
      type="button"
      variant="ghost"
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  )
}

function sessionInitial(session: Session) {
  if (session.email) {
    return session.email.charAt(0).toUpperCase()
  }

  return session.provider === "siwe" ? "W" : "C"
}

function profileInitial(
  profile: SiteHeaderActionsProps["profile"],
  session: Session
) {
  const initials = profile?.displayName
    ?.trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return initials || sessionInitial(session)
}

export function SiteHeaderActions({
  profile,
  session,
}: SiteHeaderActionsProps) {
  const pathname = usePathname()
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  async function signOut() {
    setSigningOut(true)
    setSignOutError(null)

    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST" })

      if (!response.ok) {
        throw new Error("Could not sign out. Please try again.")
      }

      window.location.assign("/")
    } catch (error) {
      setSignOutError(
        error instanceof Error
          ? error.message
          : "Could not sign out. Please try again."
      )
      setSigningOut(false)
    }
  }

  if (!session) {
    return (
      <div className="flex items-center gap-2">
        <ThemeToggle />
        {pathname !== "/sign-in" ? (
          <Link className={buttonVariants({ size: "sm" })} href="/sign-in">
            Sign in
          </Link>
        ) : null}
      </div>
    )
  }

  if (!session.onboardingComplete) {
    return (
      <div className="flex items-center gap-2">
        <ThemeToggle />
        {pathname === "/onboarding" ? (
          <Button
            disabled={signingOut}
            onClick={() => void signOut()}
            size="sm"
            type="button"
            variant="ghost"
          >
            <LogOut />
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        ) : (
          <Link className={buttonVariants({ size: "sm" })} href="/onboarding">
            Resume setup
          </Link>
        )}
        {signOutError ? (
          <span className="sr-only" role="alert">
            {signOutError}
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <ThemeToggle />
      <UserSearch />
      <Link
        aria-label="Open friends"
        className={buttonVariants({ size: "icon", variant: "ghost" })}
        href="/friends"
      >
        <UserPlus />
      </Link>
      <Link
        aria-label="Open groups"
        className={buttonVariants({ size: "icon", variant: "ghost" })}
        href="/groups"
      >
        <UsersRound />
      </Link>
      <Link
        aria-label="Open profile"
        className={buttonVariants({ size: "icon", variant: "ghost" })}
        href="/profile"
      >
        <UserRound />
      </Link>
      <Link
        aria-label="Open settings"
        className={buttonVariants({ size: "icon", variant: "ghost" })}
        href="/settings"
      >
        <Settings />
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Open account menu"
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Avatar size="sm">
            {profile?.avatarUrl ? (
              <AvatarImage alt="" src={profile.avatarUrl} />
            ) : null}
            <AvatarFallback className="bg-primary text-primary-foreground">
              {profileInitial(profile, session)}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <span className="block truncate text-foreground">
                {profile?.displayName ?? session.email ?? "Connected wallet"}
              </span>
              {profile?.username ? (
                <span className="block truncate">@{profile.username}</span>
              ) : session.email ? (
                <span className="block truncate">{session.email}</span>
              ) : null}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={signingOut}
              onClick={() => void signOut()}
              variant="destructive"
            >
              <LogOut />
              {signingOut ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {signOutError ? (
        <span className="sr-only" role="alert">
          {signOutError}
        </span>
      ) : null}
    </div>
  )
}

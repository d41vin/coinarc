"use client"

import Link from "next/link"
import { Check, Copy, Pencil, Send, UserPlus } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"

type ProfileActionsProps = {
  isAuthenticated: boolean
  isOwner: boolean
  walletAddress?: string
}

export function ProfileActions({
  isAuthenticated,
  isOwner,
  walletAddress,
}: ProfileActionsProps) {
  const [copied, setCopied] = useState<"link" | "wallet">()

  async function copy(value: string, kind: "link" | "wallet") {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      window.setTimeout(() => setCopied(undefined), 2_000)
    } catch {
      setCopied(undefined)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {isOwner ? (
          <Button render={<Link href="/settings" />}>
            <Pencil />
            Edit profile
          </Button>
        ) : isAuthenticated ? (
          <>
            <Button disabled type="button">
              <Send />
              Send
            </Button>
            <Button disabled type="button" variant="outline">
              <UserPlus />
              Add friend
            </Button>
          </>
        ) : (
          <Button render={<Link href="/sign-in" />}>
            <Send />
            Sign in to send
          </Button>
        )}
        <Button
          onClick={() => void copy(window.location.href, "link")}
          type="button"
          variant="outline"
        >
          {copied === "link" ? <Check /> : <Copy />}
          {copied === "link" ? "Copied" : "Copy profile link"}
        </Button>
        {walletAddress ? (
          <Button
            onClick={() => void copy(walletAddress, "wallet")}
            type="button"
            variant="outline"
          >
            {copied === "wallet" ? <Check /> : <Copy />}
            {copied === "wallet" ? "Copied" : "Copy wallet"}
          </Button>
        ) : null}
      </div>
      {!isOwner && isAuthenticated ? (
        <p className="text-xs text-muted-foreground">
          Sending and friends will be available in a future update.
        </p>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {copied === "link"
          ? "Profile link copied."
          : copied === "wallet"
            ? "Wallet address copied."
            : ""}
      </p>
    </div>
  )
}

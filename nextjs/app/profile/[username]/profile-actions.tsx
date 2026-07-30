"use client"

import Link from "next/link"
import {
  Check,
  Clock3,
  Copy,
  MoreHorizontal,
  Pencil,
  ShieldBan,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react"
import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { makeFunctionReference } from "convex/server"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type FriendshipStatus =
  | "not-connected"
  | "outgoing-request"
  | "incoming-request"
  | "friends"
  | "blocked-by-viewer"
  | "viewer-blocked"

type FriendshipMutationResult = { status: FriendshipStatus }

const relationshipForProfile = makeFunctionReference<
  "query",
  { username: string },
  FriendshipStatus
>("friends:relationshipForProfile")
const sendRequest = makeFunctionReference<
  "mutation",
  { username: string },
  FriendshipMutationResult
>("friends:sendRequest")
const acceptRequest = makeFunctionReference<
  "mutation",
  { username: string },
  FriendshipMutationResult
>("friends:acceptRequest")
const declineRequest = makeFunctionReference<
  "mutation",
  { username: string },
  FriendshipMutationResult
>("friends:declineRequest")
const cancelRequest = makeFunctionReference<
  "mutation",
  { username: string },
  FriendshipMutationResult
>("friends:cancelRequest")
const removeFriend = makeFunctionReference<
  "mutation",
  { username: string },
  FriendshipMutationResult
>("friends:removeFriend")
const blockUser = makeFunctionReference<
  "mutation",
  { username: string },
  FriendshipMutationResult
>("friends:blockUser")
const unblockUser = makeFunctionReference<
  "mutation",
  { username: string },
  FriendshipMutationResult
>("friends:unblockUser")

type ProfileActionsProps = {
  canConnect: boolean
  isOwner: boolean
  isSignedIn: boolean
  username: string
  walletAddress?: string
}

type Action =
  "send" | "accept" | "decline" | "cancel" | "remove" | "block" | "unblock"

const actionLabels: Record<Action, string> = {
  send: "Friend request sent.",
  accept: "You are now friends.",
  decline: "Friend request declined.",
  cancel: "Friend request cancelled.",
  remove: "Friend removed.",
  block: "This person is now blocked.",
  unblock: "This person has been unblocked.",
}

export function ProfileActions({
  canConnect,
  isOwner,
  isSignedIn,
  username,
  walletAddress,
}: ProfileActionsProps) {
  const relationship = useQuery(relationshipForProfile, { username })
  const send = useMutation(sendRequest)
  const accept = useMutation(acceptRequest)
  const decline = useMutation(declineRequest)
  const cancel = useMutation(cancelRequest)
  const remove = useMutation(removeFriend)
  const block = useMutation(blockUser)
  const unblock = useMutation(unblockUser)
  const [copied, setCopied] = useState<"link" | "wallet">()
  const [busyAction, setBusyAction] = useState<Action>()
  const [confirmation, setConfirmation] = useState<"remove" | "block">()
  const [notice, setNotice] = useState<string>()
  const [error, setError] = useState<string>()

  async function copy(value: string, kind: "link" | "wallet") {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      window.setTimeout(() => setCopied(undefined), 2_000)
    } catch {
      setCopied(undefined)
    }
  }

  async function runAction(action: Action) {
    setBusyAction(action)
    setError(undefined)
    setNotice(undefined)
    try {
      const mutation = {
        send,
        accept,
        decline,
        cancel,
        remove,
        block,
        unblock,
      }[action]
      await mutation({ username })
      setNotice(actionLabels[action])
      setConfirmation(undefined)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update this friendship. Please try again."
      )
    } finally {
      setBusyAction(undefined)
    }
  }

  const relationshipLoading = canConnect && relationship === undefined
  const confirmedAction = confirmation
  const isConfirming = Boolean(
    confirmedAction && busyAction === confirmedAction
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {isOwner ? (
          <Button render={<Link href="/settings" />}>
            <Pencil />
            Edit profile
          </Button>
        ) : !isSignedIn ? (
          <Button render={<Link href="/sign-in" />}>
            <UserPlus />
            Sign in to add friend
          </Button>
        ) : !canConnect ? (
          <Button render={<Link href="/onboarding" />}>
            <UserPlus />
            Complete setup to add friends
          </Button>
        ) : relationshipLoading ? (
          <Button disabled type="button">
            <Clock3 />
            Loading connection…
          </Button>
        ) : relationship === "not-connected" ? (
          <>
            <Button
              disabled={busyAction !== undefined}
              onClick={() => void runAction("send")}
              type="button"
            >
              <UserPlus />
              Add friend
            </Button>
            <ConnectionMenu
              disabled={busyAction !== undefined}
              onBlock={() => setConfirmation("block")}
            />
          </>
        ) : relationship === "outgoing-request" ? (
          <>
            <Button
              disabled={busyAction !== undefined}
              onClick={() => void runAction("cancel")}
              type="button"
              variant="outline"
            >
              <Clock3 />
              {busyAction === "cancel" ? "Cancelling…" : "Request sent"}
            </Button>
            <ConnectionMenu
              disabled={busyAction !== undefined}
              onBlock={() => setConfirmation("block")}
            />
          </>
        ) : relationship === "incoming-request" ? (
          <>
            <Button
              disabled={busyAction !== undefined}
              onClick={() => void runAction("accept")}
              type="button"
            >
              <UserCheck />
              {busyAction === "accept" ? "Accepting…" : "Accept friend"}
            </Button>
            <Button
              disabled={busyAction !== undefined}
              onClick={() => void runAction("decline")}
              type="button"
              variant="outline"
            >
              <UserX />
              Decline
            </Button>
            <ConnectionMenu
              disabled={busyAction !== undefined}
              onBlock={() => setConfirmation("block")}
            />
          </>
        ) : relationship === "friends" ? (
          <>
            <Button disabled type="button" variant="secondary">
              <UserCheck />
              Friends
            </Button>
            <ConnectionMenu
              disabled={busyAction !== undefined}
              onBlock={() => setConfirmation("block")}
              onRemove={() => setConfirmation("remove")}
            />
          </>
        ) : relationship === "blocked-by-viewer" ? (
          <Button
            disabled={busyAction !== undefined}
            onClick={() => void runAction("unblock")}
            type="button"
            variant="outline"
          >
            <ShieldBan />
            {busyAction === "unblock" ? "Unblocking…" : "Unblock"}
          </Button>
        ) : (
          <p className="self-center text-sm text-muted-foreground">
            Friend requests are unavailable for this profile.
          </p>
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
      {notice ? (
        <p className="text-xs text-muted-foreground" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {copied === "link"
          ? "Profile link copied."
          : copied === "wallet"
            ? "Wallet address copied."
            : ""}
      </p>
      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !isConfirming) setConfirmation(undefined)
        }}
        open={confirmation !== undefined}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmation === "block"
                ? "Block this person?"
                : "Remove friend?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation === "block"
                ? "Blocking removes any friend request or friendship between you. They will not be able to send you a new friend request."
                : "They will no longer appear in your friends list. You can send a new friend request later."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isConfirming}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isConfirming}
              onClick={() => {
                if (confirmation) void runAction(confirmation)
              }}
              type="button"
              variant="destructive"
            >
              {isConfirming
                ? confirmation === "block"
                  ? "Blocking…"
                  : "Removing…"
                : confirmation === "block"
                  ? "Block"
                  : "Remove friend"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ConnectionMenu({
  disabled,
  onBlock,
  onRemove,
}: {
  disabled: boolean
  onBlock: () => void
  onRemove?: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="More friendship actions"
        disabled={disabled}
        render={<Button size="icon" type="button" variant="outline" />}
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onRemove ? (
          <>
            <DropdownMenuItem onClick={onRemove}>
              <UserX />
              Remove friend
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem onClick={onBlock} variant="destructive">
          <ShieldBan />
          Block
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

"use client"

import Link from "next/link"
import { Check, Clock3, UserX, UsersRound } from "lucide-react"
import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { makeFunctionReference } from "convex/server"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
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

type FriendProfile = {
  avatarUrl?: string
  displayName: string
  username: string
}

type FriendsData = {
  incoming: FriendProfile[]
  outgoing: FriendProfile[]
  friends: FriendProfile[]
}

const listFriends = makeFunctionReference<
  "query",
  Record<string, never>,
  FriendsData
>("friends:list")
const acceptRequest = makeFunctionReference<"mutation", { username: string }>(
  "friends:acceptRequest"
)
const declineRequest = makeFunctionReference<"mutation", { username: string }>(
  "friends:declineRequest"
)
const cancelRequest = makeFunctionReference<"mutation", { username: string }>(
  "friends:cancelRequest"
)

type RequestAction = "accept" | "decline" | "cancel"

function initials(displayName: string) {
  return displayName
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function FriendsList() {
  const data = useQuery(listFriends)
  const accept = useMutation(acceptRequest)
  const decline = useMutation(declineRequest)
  const cancel = useMutation(cancelRequest)
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  async function updateRequest(action: RequestAction, username: string) {
    setBusy(`${action}:${username}`)
    setError(undefined)
    setNotice(undefined)
    try {
      const mutation = { accept, decline, cancel }[action]
      await mutation({ username })
      setNotice(
        action === "accept"
          ? "You are now friends."
          : action === "decline"
            ? "Friend request declined."
            : "Friend request cancelled."
      )
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update this request. Please try again."
      )
    } finally {
      setBusy(undefined)
    }
  }

  if (data === undefined) {
    return (
      <main className="mx-auto min-h-[calc(100svh-4rem)] w-full max-w-2xl p-4 sm:p-6">
        <p className="text-sm text-muted-foreground">Loading friends…</p>
      </main>
    )
  }

  return (
    <main className="mx-auto min-h-[calc(100svh-4rem)] w-full max-w-2xl p-4 sm:p-6">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Friends</h1>
          <p className="mt-1 text-muted-foreground">
            Manage friend requests and the people in your CoinArc network.
          </p>
        </div>

        {notice ? (
          <p className="text-sm text-muted-foreground" role="status">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Requests</CardTitle>
            <CardDescription>
              Accept people you know, or decline requests you do not want.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.incoming.length === 0 ? (
              <Empty className="min-h-36">
                <EmptyHeader>
                  <EmptyTitle>No pending requests</EmptyTitle>
                  <EmptyDescription>
                    Friend requests sent to you will appear here.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              data.incoming.map((person) => (
                <PersonRow
                  actions={
                    <>
                      <Button
                        disabled={busy !== undefined}
                        onClick={() =>
                          void updateRequest("accept", person.username)
                        }
                        size="sm"
                        type="button"
                      >
                        <Check />
                        {busy === `accept:${person.username}`
                          ? "Accepting…"
                          : "Accept"}
                      </Button>
                      <Button
                        disabled={busy !== undefined}
                        onClick={() =>
                          void updateRequest("decline", person.username)
                        }
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <UserX />
                        Decline
                      </Button>
                    </>
                  }
                  key={person.username}
                  person={person}
                />
              ))
            )}
          </CardContent>
        </Card>

        {data.outgoing.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Sent requests</CardTitle>
              <CardDescription>
                These requests are waiting for a response.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.outgoing.map((person) => (
                <PersonRow
                  actions={
                    <Button
                      disabled={busy !== undefined}
                      onClick={() =>
                        void updateRequest("cancel", person.username)
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Clock3 />
                      {busy === `cancel:${person.username}`
                        ? "Cancelling…"
                        : "Cancel"}
                    </Button>
                  }
                  key={person.username}
                  person={person}
                />
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>My friends</CardTitle>
            <CardDescription>
              {data.friends.length === 0
                ? "Find people from the search button in the header to start your network."
                : `${data.friends.length} friend${data.friends.length === 1 ? "" : "s"} in your network.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.friends.length === 0 ? (
              <Empty className="min-h-44">
                <EmptyHeader>
                  <EmptyTitle>No friends yet</EmptyTitle>
                  <EmptyDescription>
                    Search for people, then send a friend request from their
                    public profile.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              data.friends.map((person) => (
                <PersonRow key={person.username} person={person} />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function PersonRow({
  actions,
  person,
}: {
  actions?: React.ReactNode
  person: FriendProfile
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between">
      <Link
        className="flex min-w-0 items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        href={`/profile/${person.username}`}
      >
        <Avatar>
          {person.avatarUrl ? (
            <AvatarImage alt="" src={person.avatarUrl} />
          ) : null}
          <AvatarFallback className="bg-primary text-primary-foreground">
            {initials(person.displayName)}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0">
          <span className="block truncate font-medium">
            {person.displayName}
          </span>
          <span className="block truncate text-sm text-muted-foreground">
            @{person.username}
          </span>
        </span>
      </Link>
      {actions ? (
        <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div>
      ) : (
        <Button
          render={<Link href={`/profile/${person.username}`} />}
          size="sm"
          variant="outline"
        >
          <UsersRound />
          View profile
        </Button>
      )}
    </div>
  )
}

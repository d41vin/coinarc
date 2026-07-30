"use client"

import { formatDistanceToNow } from "date-fns"
import { Bell, Check, UserRoundX } from "lucide-react"
import { useState } from "react"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { makeFunctionReference } from "convex/server"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

type Notification = {
  _id: string
  type:
    | "friend-request-received"
    | "friend-request-accepted"
    | "friend-request-declined"
  createdAt: number
  isRead: boolean
  actor: {
    avatarUrl?: string
    displayName: string
    username: string
  }
}

const listNotifications = makeFunctionReference<
  "query",
  Record<string, never>,
  Notification[]
>("notifications:list")
const notificationUnreadCount = makeFunctionReference<
  "query",
  Record<string, never>,
  number
>("notifications:unreadCount")
const markNotificationRead = makeFunctionReference<
  "mutation",
  { notificationId: string }
>("notifications:markRead")
const markAllNotificationsRead = makeFunctionReference<"mutation">(
  "notifications:markAllRead"
)
const acceptRequest = makeFunctionReference<"mutation", { username: string }>(
  "friends:acceptRequest"
)
const declineRequest = makeFunctionReference<"mutation", { username: string }>(
  "friends:declineRequest"
)

function initials(displayName: string) {
  return displayName
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function notificationMessage(notification: Notification) {
  switch (notification.type) {
    case "friend-request-received":
      return "sent you a friend request."
    case "friend-request-accepted":
      return "accepted your friend request."
    case "friend-request-declined":
      return "declined your friend request."
  }
}

function notificationTime(createdAt: number) {
  return formatDistanceToNow(new Date(createdAt), { addSuffix: true })
}

function NotificationCenter() {
  const { isAuthenticated } = useConvexAuth()
  const notifications = useQuery(
    listNotifications,
    isAuthenticated ? {} : "skip"
  )
  const unreadCount = useQuery(
    notificationUnreadCount,
    isAuthenticated ? {} : "skip"
  )
  const markRead = useMutation(markNotificationRead)
  const markAllRead = useMutation(markAllNotificationsRead)
  const accept = useMutation(acceptRequest)
  const decline = useMutation(declineRequest)
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()

  const unreadLabel = unreadCount ?? 0
  const badgeLabel = unreadLabel > 99 ? "99+" : unreadLabel

  async function updateNotification(
    key: string,
    action: () => Promise<unknown>
  ) {
    setBusy(key)
    setError(undefined)
    try {
      await action()
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update your notifications. Please try again."
      )
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <Sheet>
      <SheetTrigger
        aria-label={
          unreadLabel > 0
            ? `Open notifications, ${unreadLabel} unread`
            : "Open notifications"
        }
        render={
          <Button
            className="relative"
            size="icon"
            type="button"
            variant="ghost"
          />
        }
      >
        <Bell />
        {unreadLabel > 0 ? (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground ring-2 ring-background"
          >
            {badgeLabel}
          </span>
        ) : null}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader className="border-b pr-14">
          <div className="flex items-center justify-between gap-4">
            <SheetTitle>Notifications</SheetTitle>
            <Button
              disabled={unreadLabel === 0 || busy !== undefined}
              onClick={() =>
                void updateNotification("mark-all", () => markAllRead({}))
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              {busy === "mark-all" ? "Markingâ€¦" : "Mark all read"}
            </Button>
          </div>
          <SheetDescription>
            Friend activity and future CoinArc updates appear here.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {error ? (
            <p className="mb-4 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {notifications === undefined ? (
            <p className="text-sm text-muted-foreground">
              Loading notificationsâ€¦
            </p>
          ) : notifications.length === 0 ? (
            <Empty className="min-h-56 border">
              <EmptyHeader>
                <EmptyTitle>You are all caught up</EmptyTitle>
                <EmptyDescription>
                  Friend activity and future CoinArc updates will appear here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <NotificationRow
                  busy={busy}
                  key={notification._id}
                  notification={notification}
                  onAccept={() =>
                    updateNotification(`accept:${notification._id}`, () =>
                      accept({ username: notification.actor.username })
                    )
                  }
                  onDecline={() =>
                    updateNotification(`decline:${notification._id}`, () =>
                      decline({ username: notification.actor.username })
                    )
                  }
                  onMarkRead={() =>
                    updateNotification(`read:${notification._id}`, () =>
                      markRead({ notificationId: notification._id })
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function NotificationRow({
  busy,
  notification,
  onAccept,
  onDecline,
  onMarkRead,
}: {
  busy?: string
  notification: Notification
  onAccept: () => void
  onDecline: () => void
  onMarkRead: () => void
}) {
  const actionKey = (action: string) => `${action}:${notification._id}`
  const isRequest = notification.type === "friend-request-received"

  return (
    <article
      className={cn(
        "rounded-2xl border p-3",
        !notification.isRead && "bg-muted/50"
      )}
    >
      <div className="flex gap-3">
        <Avatar>
          {notification.actor.avatarUrl ? (
            <AvatarImage alt="" src={notification.actor.avatarUrl} />
          ) : null}
          <AvatarFallback className="bg-primary text-primary-foreground">
            {initials(notification.actor.displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-5">
            <span className="font-medium">
              {notification.actor.displayName}
            </span>{" "}
            {notificationMessage(notification)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {notificationTime(notification.createdAt)}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {isRequest ? (
          <>
            <Button
              disabled={busy !== undefined}
              onClick={onAccept}
              size="sm"
              type="button"
            >
              <Check />
              {busy === actionKey("accept") ? "Acceptingâ€¦" : "Accept"}
            </Button>
            <Button
              disabled={busy !== undefined}
              onClick={onDecline}
              size="sm"
              type="button"
              variant="outline"
            >
              <UserRoundX />
              {busy === actionKey("decline") ? "Decliningâ€¦" : "Decline"}
            </Button>
          </>
        ) : null}
        {!notification.isRead ? (
          <Button
            disabled={busy !== undefined}
            onClick={onMarkRead}
            size="sm"
            type="button"
            variant="ghost"
          >
            {busy === actionKey("read") ? "Markingâ€¦" : "Mark read"}
          </Button>
        ) : null}
      </div>
    </article>
  )
}

export function HeaderNotificationCenter() {
  return <NotificationCenter />
}

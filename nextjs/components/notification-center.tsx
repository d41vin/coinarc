"use client"

import { formatDistanceToNow } from "date-fns"
import { Bell, Check, UserRoundX } from "lucide-react"
import { useState } from "react"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { makeFunctionReference } from "convex/server"
import { useRouter } from "next/navigation"

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
    | "payment-received"
    | "payment-request-received"
    | "payment-request-declined"
    | "payment-request-completed"
    | "split-invited"
    | "split-reminder"
    | "split-participant-paid"
    | "split-participant-declined"
    | "split-paid-outside"
    | "split-deadline-extended"
    | "split-closed"
    | "split-cancelled"
  source:
    | { type: "friend-request"; id: string }
    | { type: "payment"; id: string }
    | { type: "payment-request"; id: string }
    | { type: "split"; id: string }
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
    case "payment-received":
      return "sent you a payment."
    case "payment-request-received":
      return "requested a payment from you."
    case "payment-request-declined":
      return "declined your payment request."
    case "payment-request-completed":
      return "paid your payment request."
    case "split-invited":
      return "invited you to split a bill."
    case "split-reminder":
      return "sent a reminder for a split bill."
    case "split-participant-paid":
      return "paid their split contribution."
    case "split-participant-declined":
      return "declined a split contribution."
    case "split-paid-outside":
      return "recorded your split contribution outside CoinArc."
    case "split-deadline-extended":
      return "extended a split bill deadline."
    case "split-closed":
      return "closed a split bill."
    case "split-cancelled":
      return "cancelled a split bill."
  }
}

function notificationTime(createdAt: number) {
  return formatDistanceToNow(new Date(createdAt), { addSuffix: true })
}

function NotificationCenter() {
  const router = useRouter()
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
  const [open, setOpen] = useState(false)

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
    <Sheet onOpenChange={setOpen} open={open}>
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
              {busy === "mark-all" ? "Marking…" : "Mark all read"}
            </Button>
          </div>
          <SheetDescription>
            Payment, split, request, and friend activity appears here.
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
              Loading notifications…
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
                  onOpenPayment={() =>
                    void updateNotification(
                      `payment:${notification._id}`,
                      async () => {
                        if (!notification.isRead) {
                          await markRead({ notificationId: notification._id })
                        }
                        setOpen(false)
                        router.push(`/home?payment=${notification.source.id}`)
                      }
                    )
                  }
                  onOpenRequest={() =>
                    void updateNotification(
                      `request:${notification._id}`,
                      async () => {
                        if (!notification.isRead) {
                          await markRead({ notificationId: notification._id })
                        }
                        setOpen(false)
                        router.push(`/home?request=${notification.source.id}`)
                      }
                    )
                  }
                  onOpenSplit={() =>
                    void updateNotification(
                      `split:${notification._id}`,
                      async () => {
                        if (!notification.isRead) {
                          await markRead({ notificationId: notification._id })
                        }
                        setOpen(false)
                        router.push(`/home?split=${notification.source.id}`)
                      }
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
  onOpenPayment,
  onOpenRequest,
  onOpenSplit,
}: {
  busy?: string
  notification: Notification
  onAccept: () => void
  onDecline: () => void
  onMarkRead: () => void
  onOpenPayment: () => void
  onOpenRequest: () => void
  onOpenSplit: () => void
}) {
  const actionKey = (action: string) => `${action}:${notification._id}`
  const isRequest = notification.type === "friend-request-received"
  const isPayment = notification.type === "payment-received"
  const isPaymentRequest =
    notification.type === "payment-request-received" ||
    notification.type === "payment-request-declined" ||
    notification.type === "payment-request-completed"
  const isSplit = notification.type.startsWith("split-")
  const isClickable = isPayment || isPaymentRequest || isSplit
  const summary = (
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
        <p className="text-left text-sm leading-5">
          <span className="font-medium">{notification.actor.displayName}</span>{" "}
          {notificationMessage(notification)}
        </p>
        <p className="mt-1 text-left text-xs text-muted-foreground">
          {notificationTime(notification.createdAt)}
        </p>
      </div>
    </div>
  )

  return (
    <article
      className={cn(
        "rounded-2xl border p-3",
        !notification.isRead && "bg-muted/50"
      )}
    >
      {isClickable ? (
        <Button
          className="h-auto w-full justify-start p-0 text-left hover:bg-transparent"
          disabled={busy !== undefined}
          onClick={
            isPayment
              ? onOpenPayment
              : isPaymentRequest
                ? onOpenRequest
                : onOpenSplit
          }
          type="button"
          variant="ghost"
        >
          {summary}
        </Button>
      ) : (
        summary
      )}
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
              {busy === actionKey("accept") ? "Accepting…" : "Accept"}
            </Button>
            <Button
              disabled={busy !== undefined}
              onClick={onDecline}
              size="sm"
              type="button"
              variant="outline"
            >
              <UserRoundX />
              {busy === actionKey("decline") ? "Declining…" : "Decline"}
            </Button>
          </>
        ) : null}
        {!notification.isRead && !isClickable ? (
          <Button
            disabled={busy !== undefined}
            onClick={onMarkRead}
            size="sm"
            type="button"
            variant="ghost"
          >
            {busy === actionKey("read") ? "Marking…" : "Mark read"}
          </Button>
        ) : null}
      </div>
    </article>
  )
}

export function HeaderNotificationCenter() {
  return <NotificationCenter />
}

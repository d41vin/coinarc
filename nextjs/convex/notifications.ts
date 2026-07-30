import { v } from "convex/values"

import { mutation, query } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"

const ARC_TESTNET_CHAIN_ID = 5_042_002
const MAX_NOTIFICATIONS_PER_USER = 100
const MAX_NOTIFICATIONS_PER_SOURCE = 3

type CoinArcIdentity = {
  tokenIdentifier: string
  subject: string
  walletAddress?: unknown
  walletChainId?: unknown
  walletCustody?: unknown
  circleWalletId?: unknown
}

type NotificationType =
  | "friend-request-received"
  | "friend-request-accepted"
  | "friend-request-declined"

type NotificationActor = {
  avatarUrl?: string
  displayName: string
  username: string
}

function identity(ctx: {
  auth: { getUserIdentity: () => Promise<CoinArcIdentity | null> }
}) {
  return ctx.auth.getUserIdentity()
}

function externalWalletAddress(auth: CoinArcIdentity) {
  if (
    typeof auth.walletAddress !== "string" ||
    !/^0x[a-fA-F0-9]{40}$/.test(auth.walletAddress) ||
    auth.walletChainId !== ARC_TESTNET_CHAIN_ID ||
    auth.walletCustody !== "external" ||
    auth.circleWalletId !== undefined
  ) {
    return null
  }

  const address = auth.walletAddress.toLowerCase()
  return auth.subject === `siwe:${address}` ? address : null
}

async function currentUser(ctx: MutationCtx | QueryCtx, auth: CoinArcIdentity) {
  const directUser = await ctx.db
    .query("users")
    .withIndex("by_token_identifier", (q) =>
      q.eq("tokenIdentifier", auth.tokenIdentifier)
    )
    .unique()
  if (directUser) return directUser

  const address = externalWalletAddress(auth)
  if (!address) return null
  const linkedWallet = await ctx.db
    .query("wallets")
    .withIndex("by_address", (q) => q.eq("address", address))
    .unique()
  return linkedWallet ? await ctx.db.get(linkedWallet.userId) : null
}

async function currentOnboardedUser(ctx: MutationCtx | QueryCtx) {
  const auth = await identity(ctx)
  if (!auth) throw new Error("Unauthorized")

  const user = await currentUser(ctx, auth)
  if (!user?.onboardingComplete) throw new Error("Complete onboarding first")
  return user
}

async function actorFor(
  ctx: QueryCtx,
  userId: Id<"users">
): Promise<NotificationActor | null> {
  const user = await ctx.db.get(userId)
  if (
    !user ||
    !user.onboardingComplete ||
    !user.displayName ||
    !user.username
  ) {
    return null
  }

  return {
    avatarUrl: user.avatarUrl,
    displayName: user.displayName,
    username: user.username,
  }
}

async function changeUnreadCount(
  ctx: MutationCtx,
  userId: Id<"users">,
  change: number
) {
  const state = await ctx.db
    .query("notificationStates")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .unique()

  if (!state) {
    if (change <= 0) return
    await ctx.db.insert("notificationStates", {
      userId,
      unreadCount: change,
    })
    return
  }

  await ctx.db.patch(state._id, {
    unreadCount: Math.max(0, state.unreadCount + change),
  })
}

async function deleteNotification(
  ctx: MutationCtx,
  notification: {
    _id: Id<"notifications">
    recipientId: Id<"users">
    isRead: boolean
  }
) {
  await ctx.db.delete(notification._id)
  if (!notification.isRead) {
    await changeUnreadCount(ctx, notification.recipientId, -1)
  }
}

async function retainNewestNotifications(
  ctx: MutationCtx,
  recipientId: Id<"users">
) {
  const notifications = await ctx.db
    .query("notifications")
    .withIndex("by_recipient_id_and_created_at", (q) =>
      q.eq("recipientId", recipientId)
    )
    .order("desc")
    .take(MAX_NOTIFICATIONS_PER_USER + 1)

  const oldest = notifications.at(-1)
  if (notifications.length > MAX_NOTIFICATIONS_PER_USER && oldest) {
    await deleteNotification(ctx, oldest)
  }
}

export async function createFriendRequestNotification(
  ctx: MutationCtx,
  {
    recipientId,
    actorId,
    requestId,
    type,
    createdAt,
  }: {
    recipientId: Id<"users">
    actorId: Id<"users">
    requestId: Id<"friendRequests">
    type: NotificationType
    createdAt: number
  }
) {
  await ctx.db.insert("notifications", {
    recipientId,
    actorId,
    type,
    source: { type: "friend-request", id: requestId },
    createdAt,
    isRead: false,
  })
  await changeUnreadCount(ctx, recipientId, 1)
  await retainNewestNotifications(ctx, recipientId)
}

export async function deleteNotificationsForFriendRequest(
  ctx: MutationCtx,
  requestId: Id<"friendRequests">
) {
  const notifications = await ctx.db
    .query("notifications")
    .withIndex("by_source_id", (q) => q.eq("source.id", requestId))
    .take(MAX_NOTIFICATIONS_PER_SOURCE)

  for (const notification of notifications) {
    await deleteNotification(ctx, notification)
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await currentOnboardedUser(ctx)
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_id_and_created_at", (q) =>
        q.eq("recipientId", viewer._id)
      )
      .order("desc")
      .take(MAX_NOTIFICATIONS_PER_USER)

    const hydrated = await Promise.all(
      notifications.map(async (notification) => {
        const actor = await actorFor(ctx, notification.actorId)
        if (!actor) return null

        return {
          _id: notification._id,
          type: notification.type,
          createdAt: notification.createdAt,
          isRead: notification.isRead,
          actor,
        }
      })
    )

    return hydrated.filter(
      (notification): notification is NonNullable<(typeof hydrated)[number]> =>
        notification !== null
    )
  },
})

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await currentOnboardedUser(ctx)
    const state = await ctx.db
      .query("notificationStates")
      .withIndex("by_user_id", (q) => q.eq("userId", viewer._id))
      .unique()
    return state?.unreadCount ?? 0
  },
})

export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const viewer = await currentOnboardedUser(ctx)
    const notification = await ctx.db.get(args.notificationId)
    if (!notification || notification.recipientId !== viewer._id) {
      throw new Error("Notification not found")
    }
    if (notification.isRead) return null

    await ctx.db.patch(notification._id, {
      isRead: true,
      readAt: Date.now(),
    })
    await changeUnreadCount(ctx, viewer._id, -1)
    return null
  },
})

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await currentOnboardedUser(ctx)
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_id_and_is_read", (q) =>
        q.eq("recipientId", viewer._id).eq("isRead", false)
      )
      .take(MAX_NOTIFICATIONS_PER_USER)
    if (notifications.length === 0) return null

    const readAt = Date.now()
    for (const notification of notifications) {
      await ctx.db.patch(notification._id, { isRead: true, readAt })
    }

    const state = await ctx.db
      .query("notificationStates")
      .withIndex("by_user_id", (q) => q.eq("userId", viewer._id))
      .unique()
    if (state) {
      await ctx.db.patch(state._id, { unreadCount: 0 })
    }
    return null
  },
})

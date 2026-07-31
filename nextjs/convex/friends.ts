import { v } from "convex/values"

import { mutation, query } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import {
  createFriendRequestNotification,
  deleteNotificationsForFriendRequest,
} from "./notifications"
import {
  archiveDirectConversationBetween,
  restoreDirectConversationBetween,
} from "./directMessages"

const ARC_TESTNET_CHAIN_ID = 5_042_002
const MAX_LIST_ITEMS = 100

type CoinArcIdentity = {
  tokenIdentifier: string
  subject: string
  walletAddress?: unknown
  walletChainId?: unknown
  walletCustody?: unknown
  circleWalletId?: unknown
}

type FriendshipStatus =
  | "not-connected"
  | "outgoing-request"
  | "incoming-request"
  | "friends"
  | "blocked-by-viewer"
  | "viewer-blocked"

type FriendProfile = {
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

function normalizeUsername(username: string) {
  return username.trim().replace(/^@+/, "").toLowerCase()
}

async function publicUserByUsername(
  ctx: MutationCtx | QueryCtx,
  username: string
) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_username", (q) =>
      q.eq("username", normalizeUsername(username))
    )
    .unique()
  if (
    !user ||
    !user.onboardingComplete ||
    !user.displayName ||
    !user.username
  ) {
    throw new Error("Profile not found")
  }
  return user
}

async function exactRequest(
  ctx: MutationCtx | QueryCtx,
  senderId: Id<"users">,
  recipientId: Id<"users">
) {
  return await ctx.db
    .query("friendRequests")
    .withIndex("by_sender_id_and_recipient_id", (q) =>
      q.eq("senderId", senderId).eq("recipientId", recipientId)
    )
    .unique()
}

async function exactFriendship(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  friendId: Id<"users">
) {
  return await ctx.db
    .query("friendships")
    .withIndex("by_user_id_and_friend_id", (q) =>
      q.eq("userId", userId).eq("friendId", friendId)
    )
    .unique()
}

async function exactBlock(
  ctx: MutationCtx | QueryCtx,
  blockerId: Id<"users">,
  blockedId: Id<"users">
) {
  return await ctx.db
    .query("userBlocks")
    .withIndex("by_blocker_id_and_blocked_id", (q) =>
      q.eq("blockerId", blockerId).eq("blockedId", blockedId)
    )
    .unique()
}

async function assertNoBlock(
  ctx: MutationCtx | QueryCtx,
  viewerId: Id<"users">,
  otherUserId: Id<"users">
) {
  const [viewerBlock, otherUserBlock] = await Promise.all([
    exactBlock(ctx, viewerId, otherUserId),
    exactBlock(ctx, otherUserId, viewerId),
  ])
  if (viewerBlock || otherUserBlock)
    throw new Error("This connection is unavailable")
}

async function profileFor(
  ctx: QueryCtx,
  userId: Id<"users">
): Promise<FriendProfile | null> {
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
    displayName: user.displayName,
    username: user.username,
    avatarUrl: user.avatarUrl,
  }
}

async function statusFor(
  ctx: QueryCtx,
  viewerId: Id<"users">,
  profileUserId: Id<"users">
): Promise<FriendshipStatus> {
  if (viewerId === profileUserId) return "not-connected"

  const [viewerBlock, blockedByProfile] = await Promise.all([
    exactBlock(ctx, viewerId, profileUserId),
    exactBlock(ctx, profileUserId, viewerId),
  ])
  if (viewerBlock) return "blocked-by-viewer"
  if (blockedByProfile) return "viewer-blocked"

  if (await exactFriendship(ctx, viewerId, profileUserId)) return "friends"
  if (await exactRequest(ctx, viewerId, profileUserId))
    return "outgoing-request"
  if (await exactRequest(ctx, profileUserId, viewerId))
    return "incoming-request"
  return "not-connected"
}

export const relationshipForProfile = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const auth = await identity(ctx)
    if (!auth) return "not-connected" satisfies FriendshipStatus
    const viewer = await currentUser(ctx, auth)
    if (!viewer?.onboardingComplete)
      return "not-connected" satisfies FriendshipStatus

    const profile = await publicUserByUsername(ctx, args.username).catch(
      () => null
    )
    if (!profile) return "not-connected" satisfies FriendshipStatus
    return await statusFor(ctx, viewer._id, profile._id)
  },
})

export const sendRequest = mutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const viewer = await currentOnboardedUser(ctx)
    const recipient = await publicUserByUsername(ctx, args.username)
    if (viewer._id === recipient._id) throw new Error("You cannot add yourself")
    await assertNoBlock(ctx, viewer._id, recipient._id)

    if (await exactFriendship(ctx, viewer._id, recipient._id)) {
      return { status: "friends" satisfies FriendshipStatus }
    }
    if (await exactRequest(ctx, viewer._id, recipient._id)) {
      return { status: "outgoing-request" satisfies FriendshipStatus }
    }
    if (await exactRequest(ctx, recipient._id, viewer._id)) {
      throw new Error("This person has already sent you a friend request")
    }

    const createdAt = Date.now()
    const requestId = await ctx.db.insert("friendRequests", {
      senderId: viewer._id,
      recipientId: recipient._id,
      createdAt,
    })
    await createFriendRequestNotification(ctx, {
      recipientId: recipient._id,
      actorId: viewer._id,
      requestId,
      type: "friend-request-received",
      createdAt,
    })
    return { status: "outgoing-request" satisfies FriendshipStatus }
  },
})

export const acceptRequest = mutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const viewer = await currentOnboardedUser(ctx)
    const sender = await publicUserByUsername(ctx, args.username)
    if (viewer._id === sender._id) throw new Error("You cannot add yourself")
    await assertNoBlock(ctx, viewer._id, sender._id)

    const request = await exactRequest(ctx, sender._id, viewer._id)
    const [viewerFriendship, senderFriendship] = await Promise.all([
      exactFriendship(ctx, viewer._id, sender._id),
      exactFriendship(ctx, sender._id, viewer._id),
    ])
    if (request) {
      await ctx.db.delete(request._id)
      await deleteNotificationsForFriendRequest(ctx, request._id)
      await createFriendRequestNotification(ctx, {
        recipientId: sender._id,
        actorId: viewer._id,
        requestId: request._id,
        type: "friend-request-accepted",
        createdAt: Date.now(),
      })
    }
    if (!request && !viewerFriendship && !senderFriendship)
      throw new Error("Friend request no longer exists")

    if (!viewerFriendship) {
      await ctx.db.insert("friendships", {
        userId: viewer._id,
        friendId: sender._id,
        createdAt: Date.now(),
      })
    }
    if (!senderFriendship) {
      await ctx.db.insert("friendships", {
        userId: sender._id,
        friendId: viewer._id,
        createdAt: Date.now(),
      })
    }
    await restoreDirectConversationBetween(ctx, viewer._id, sender._id)
    return { status: "friends" satisfies FriendshipStatus }
  },
})

export const declineRequest = mutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const viewer = await currentOnboardedUser(ctx)
    const sender = await publicUserByUsername(ctx, args.username)
    const request = await exactRequest(ctx, sender._id, viewer._id)
    if (request) {
      await ctx.db.delete(request._id)
      await deleteNotificationsForFriendRequest(ctx, request._id)
      await createFriendRequestNotification(ctx, {
        recipientId: sender._id,
        actorId: viewer._id,
        requestId: request._id,
        type: "friend-request-declined",
        createdAt: Date.now(),
      })
    }
    return { status: "not-connected" satisfies FriendshipStatus }
  },
})

export const cancelRequest = mutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const viewer = await currentOnboardedUser(ctx)
    const recipient = await publicUserByUsername(ctx, args.username)
    const request = await exactRequest(ctx, viewer._id, recipient._id)
    if (request) {
      await ctx.db.delete(request._id)
      await deleteNotificationsForFriendRequest(ctx, request._id)
    }
    return { status: "not-connected" satisfies FriendshipStatus }
  },
})

export const removeFriend = mutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const viewer = await currentOnboardedUser(ctx)
    const friend = await publicUserByUsername(ctx, args.username)
    const [viewerFriendship, reciprocalFriendship] = await Promise.all([
      exactFriendship(ctx, viewer._id, friend._id),
      exactFriendship(ctx, friend._id, viewer._id),
    ])
    if (viewerFriendship) await ctx.db.delete(viewerFriendship._id)
    if (reciprocalFriendship) await ctx.db.delete(reciprocalFriendship._id)
    await archiveDirectConversationBetween(ctx, viewer._id, friend._id)
    return { status: "not-connected" satisfies FriendshipStatus }
  },
})

export const blockUser = mutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const viewer = await currentOnboardedUser(ctx)
    const blockedUser = await publicUserByUsername(ctx, args.username)
    if (viewer._id === blockedUser._id)
      throw new Error("You cannot block yourself")

    const [
      existingBlock,
      outgoingRequest,
      incomingRequest,
      friendship,
      reciprocal,
    ] = await Promise.all([
      exactBlock(ctx, viewer._id, blockedUser._id),
      exactRequest(ctx, viewer._id, blockedUser._id),
      exactRequest(ctx, blockedUser._id, viewer._id),
      exactFriendship(ctx, viewer._id, blockedUser._id),
      exactFriendship(ctx, blockedUser._id, viewer._id),
    ])
    if (!existingBlock) {
      await ctx.db.insert("userBlocks", {
        blockerId: viewer._id,
        blockedId: blockedUser._id,
        createdAt: Date.now(),
      })
    }
    for (const connection of [
      outgoingRequest,
      incomingRequest,
      friendship,
      reciprocal,
    ]) {
      if (connection) await ctx.db.delete(connection._id)
    }
    for (const request of [outgoingRequest, incomingRequest]) {
      if (request) await deleteNotificationsForFriendRequest(ctx, request._id)
    }
    await archiveDirectConversationBetween(ctx, viewer._id, blockedUser._id)
    return { status: "blocked-by-viewer" satisfies FriendshipStatus }
  },
})

export const unblockUser = mutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const viewer = await currentOnboardedUser(ctx)
    const blockedUser = await publicUserByUsername(ctx, args.username)
    const block = await exactBlock(ctx, viewer._id, blockedUser._id)
    if (block) await ctx.db.delete(block._id)

    const stillBlocked = await exactBlock(ctx, blockedUser._id, viewer._id)
    return {
      status: (stillBlocked
        ? "viewer-blocked"
        : "not-connected") satisfies FriendshipStatus,
    }
  },
})

export const list = query({
  args: {},
  handler: async (ctx) => {
    const auth = await identity(ctx)
    if (!auth) return { incoming: [], outgoing: [], friends: [] }
    const viewer = await currentUser(ctx, auth)
    if (!viewer?.onboardingComplete)
      return { incoming: [], outgoing: [], friends: [] }
    const [incomingRequests, outgoingRequests, friendships] = await Promise.all(
      [
        ctx.db
          .query("friendRequests")
          .withIndex("by_recipient_id_and_sender_id", (q) =>
            q.eq("recipientId", viewer._id)
          )
          .order("desc")
          .take(MAX_LIST_ITEMS),
        ctx.db
          .query("friendRequests")
          .withIndex("by_sender_id_and_recipient_id", (q) =>
            q.eq("senderId", viewer._id)
          )
          .order("desc")
          .take(MAX_LIST_ITEMS),
        ctx.db
          .query("friendships")
          .withIndex("by_user_id_and_created_at", (q) =>
            q.eq("userId", viewer._id)
          )
          .order("desc")
          .take(MAX_LIST_ITEMS),
      ]
    )

    const [incoming, outgoing, friends] = await Promise.all([
      Promise.all(
        incomingRequests.map(
          async (request) => await profileFor(ctx, request.senderId)
        )
      ),
      Promise.all(
        outgoingRequests.map(
          async (request) => await profileFor(ctx, request.recipientId)
        )
      ),
      Promise.all(
        friendships.map(
          async (friendship) => await profileFor(ctx, friendship.friendId)
        )
      ),
    ])

    return {
      incoming: incoming.filter(
        (profile): profile is FriendProfile => profile !== null
      ),
      outgoing: outgoing.filter(
        (profile): profile is FriendProfile => profile !== null
      ),
      friends: friends.filter(
        (profile): profile is FriendProfile => profile !== null
      ),
    }
  },
})

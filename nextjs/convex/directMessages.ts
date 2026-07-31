import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter"

import { components } from "./_generated/api"
import { mutation, query } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"

const ARC_TESTNET_CHAIN_ID = 5_042_002
const MAX_INBOX_ITEMS = 100
const MAX_REACTIONS_PER_MESSAGE = 10
const MAX_MESSAGE_LENGTH = 2_000
const REACTION_EMOJIS = ["👍", "❤️", "😂", "👀"] as const

const reactionValidator = v.union(
  v.literal("👍"),
  v.literal("❤️"),
  v.literal("😂"),
  v.literal("👀")
)

const rateLimiter = new RateLimiter(
  (components as { rateLimiter: never }).rateLimiter,
  {
    directMessageSend: {
      kind: "token bucket",
      rate: 20,
      period: MINUTE,
      capacity: 30,
    },
    directMessageReaction: {
      kind: "token bucket",
      rate: 30,
      period: MINUTE,
      capacity: 40,
    },
  }
)

type CoinArcIdentity = {
  tokenIdentifier: string
  subject: string
  walletAddress?: unknown
  walletChainId?: unknown
  walletCustody?: unknown
  circleWalletId?: unknown
}

type DbCtx = MutationCtx | QueryCtx
type DirectParticipant = {
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

async function currentUser(ctx: DbCtx, auth: CoinArcIdentity) {
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

async function currentOnboardedUser(ctx: DbCtx) {
  const auth = await identity(ctx)
  if (!auth) throw new Error("Unauthorized")

  const user = await currentUser(ctx, auth)
  if (!user?.onboardingComplete) throw new Error("Complete onboarding first")
  return user
}

function normalizeUsername(username: string) {
  return username.trim().replace(/^@+/, "").toLowerCase()
}

async function participantByUsername(ctx: DbCtx, username: string) {
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
    return null
  }
  return user
}

function profileFor(user: Doc<"users">): DirectParticipant | null {
  if (!user.onboardingComplete || !user.displayName || !user.username)
    return null

  return {
    displayName: user.displayName,
    username: user.username,
    avatarUrl: user.avatarUrl,
  }
}

async function exactFriendship(
  ctx: DbCtx,
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
  ctx: DbCtx,
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

async function canMessage(
  ctx: DbCtx,
  viewerId: Id<"users">,
  otherUserId: Id<"users">
) {
  const [viewerFriendship, otherFriendship, viewerBlock, otherBlock] =
    await Promise.all([
      exactFriendship(ctx, viewerId, otherUserId),
      exactFriendship(ctx, otherUserId, viewerId),
      exactBlock(ctx, viewerId, otherUserId),
      exactBlock(ctx, otherUserId, viewerId),
    ])
  return Boolean(
    viewerFriendship && otherFriendship && !viewerBlock && !otherBlock
  )
}

function orderedParticipants(userId: Id<"users">, otherUserId: Id<"users">) {
  return String(userId) < String(otherUserId)
    ? [userId, otherUserId]
    : [otherUserId, userId]
}

async function conversationForPair(
  ctx: DbCtx,
  userId: Id<"users">,
  otherUserId: Id<"users">
) {
  const [participantAId, participantBId] = orderedParticipants(userId, otherUserId)
  return await ctx.db
    .query("directConversations")
    .withIndex("by_participant_a_id_and_participant_b_id", (q) =>
      q.eq("participantAId", participantAId).eq("participantBId", participantBId)
    )
    .unique()
}

async function memberFor(
  ctx: DbCtx,
  conversationId: Id<"directConversations">,
  userId: Id<"users">
) {
  return await ctx.db
    .query("directConversationMembers")
    .withIndex("by_conversation_id_and_user_id", (q) =>
      q.eq("conversationId", conversationId).eq("userId", userId)
    )
    .unique()
}

async function changeUnreadCount(
  ctx: MutationCtx,
  userId: Id<"users">,
  change: number
) {
  const state = await ctx.db
    .query("directMessageStates")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .unique()
  if (!state) {
    if (change <= 0) return
    await ctx.db.insert("directMessageStates", { userId, unreadCount: change })
    return
  }
  await ctx.db.patch(state._id, {
    unreadCount: Math.max(0, state.unreadCount + change),
  })
}

async function reactionsForMessage(ctx: QueryCtx, messageId: Id<"directMessages">) {
  return await ctx.db
    .query("directMessageReactions")
    .withIndex("by_message_id_and_user_id", (q) => q.eq("messageId", messageId))
    .take(MAX_REACTIONS_PER_MESSAGE)
}

async function hydrateMessage(
  ctx: QueryCtx,
  message: Doc<"directMessages">,
  viewerId: Id<"users">
) {
  const reactions = await reactionsForMessage(ctx, message._id)
  return {
    _id: message._id,
    body: message.body,
    createdAt: message.createdAt,
    isOwn: message.senderId === viewerId,
    viewerReaction:
      reactions.find((reaction) => reaction.userId === viewerId)?.emoji ?? null,
    reactions: REACTION_EMOJIS.map((emoji) => ({
      emoji,
      count: reactions.filter((reaction) => reaction.emoji === emoji).length,
    })).filter((reaction) => reaction.count > 0),
  }
}

export async function archiveDirectConversationBetween(
  ctx: MutationCtx,
  userId: Id<"users">,
  otherUserId: Id<"users">
) {
  const conversation = await conversationForPair(ctx, userId, otherUserId)
  if (!conversation || conversation.isArchived) return

  const members = await ctx.db
    .query("directConversationMembers")
    .withIndex("by_conversation_id", (q) =>
      q.eq("conversationId", conversation._id)
    )
    .take(2)
  for (const member of members) {
    await ctx.db.patch(member._id, { isArchived: true, unreadCount: 0 })
    await changeUnreadCount(ctx, member.userId, -member.unreadCount)
  }
  await ctx.db.patch(conversation._id, { isArchived: true, archivedAt: Date.now() })
}

export async function restoreDirectConversationBetween(
  ctx: MutationCtx,
  userId: Id<"users">,
  otherUserId: Id<"users">
) {
  const conversation = await conversationForPair(ctx, userId, otherUserId)
  if (!conversation || !conversation.isArchived) return

  const members = await ctx.db
    .query("directConversationMembers")
    .withIndex("by_conversation_id", (q) =>
      q.eq("conversationId", conversation._id)
    )
    .take(2)
  for (const member of members) {
    await ctx.db.patch(member._id, { isArchived: false })
  }
  await ctx.db.patch(conversation._id, { isArchived: false })
}

export const listInbox = query({
  args: { archived: v.boolean() },
  handler: async (ctx, args) => {
    const auth = await identity(ctx)
    if (!auth) return []
    const viewer = await currentUser(ctx, auth)
    if (!viewer?.onboardingComplete) return []

    const members = await ctx.db
      .query("directConversationMembers")
      .withIndex("by_user_id_and_is_archived_and_last_message_at", (q) =>
        q.eq("userId", viewer._id).eq("isArchived", args.archived)
      )
      .order("desc")
      .take(MAX_INBOX_ITEMS)

    const hydrated = await Promise.all(
      members.map(async (member) => {
        const [otherUser, message] = await Promise.all([
          ctx.db.get(member.otherUserId),
          ctx.db.get(member.lastMessageId),
        ])
        if (!otherUser || !message) return null
        const participant = profileFor(otherUser)
        if (!participant) return null
        return {
          conversationId: member.conversationId,
          participant,
          lastMessage: {
            body: message.body,
            createdAt: message.createdAt,
            isOwn: message.senderId === viewer._id,
          },
          unreadCount: member.unreadCount,
        }
      })
    )
    return hydrated.filter(
      (conversation): conversation is NonNullable<(typeof hydrated)[number]> =>
        conversation !== null
    )
  },
})

export const conversationForUsername = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const auth = await identity(ctx)
    if (!auth) return { status: "unavailable" as const }
    const viewer = await currentUser(ctx, auth)
    if (!viewer?.onboardingComplete) return { status: "unavailable" as const }
    const otherUser = await participantByUsername(ctx, args.username)
    if (!otherUser || otherUser._id === viewer._id)
      return { status: "unavailable" as const }

    const participant = profileFor(otherUser)
    if (!participant) return { status: "unavailable" as const }
    const conversation = await conversationForPair(ctx, viewer._id, otherUser._id)
    if (!conversation) {
      return (await canMessage(ctx, viewer._id, otherUser._id))
        ? { status: "empty" as const, participant }
        : { status: "unavailable" as const }
    }

    const member = await memberFor(ctx, conversation._id, viewer._id)
    if (!member) return { status: "unavailable" as const }
    if (conversation.isArchived || member.isArchived) {
      return {
        status: "archived" as const,
        conversationId: conversation._id,
        participant,
      }
    }
    if (!(await canMessage(ctx, viewer._id, otherUser._id))) {
      return {
        status: "archived" as const,
        conversationId: conversation._id,
        participant,
      }
    }
    return {
      status: "active" as const,
      conversationId: conversation._id,
      participant,
    }
  },
})

export const listMessages = query({
  args: {
    conversationId: v.id("directConversations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const viewer = await currentOnboardedUser(ctx)
    const member = await memberFor(ctx, args.conversationId, viewer._id)
    if (!member) throw new Error("Conversation not found")

    const page = await ctx.db
      .query("directMessages")
      .withIndex("by_conversation_id_and_created_at", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("desc")
      .paginate(args.paginationOpts)
    const hydrated = await Promise.all(
      page.page.map(
        async (message) => await hydrateMessage(ctx, message, viewer._id)
      )
    )
    return { ...page, page: hydrated }
  },
})

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const auth = await identity(ctx)
    if (!auth) return 0
    const viewer = await currentUser(ctx, auth)
    if (!viewer?.onboardingComplete) return 0
    const state = await ctx.db
      .query("directMessageStates")
      .withIndex("by_user_id", (q) => q.eq("userId", viewer._id))
      .unique()
    return state?.unreadCount ?? 0
  },
})

export const sendMessage = mutation({
  args: {
    username: v.string(),
    body: v.string(),
    clientMessageId: v.string(),
  },
  handler: async (ctx, args) => {
    const sender = await currentOnboardedUser(ctx)
    const recipient = await participantByUsername(ctx, args.username)
    if (!recipient || recipient._id === sender._id)
      throw new Error("Conversation not found")
    if (!(await canMessage(ctx, sender._id, recipient._id))) {
      throw new Error("Messaging is unavailable for this connection")
    }

    const body = args.body.trim()
    if (!body) throw new Error("Message cannot be empty")
    if (body.length > MAX_MESSAGE_LENGTH)
      throw new Error(`Messages must be ${MAX_MESSAGE_LENGTH} characters or fewer`)
    if (!args.clientMessageId || args.clientMessageId.length > 128)
      throw new Error("Invalid message")

    const limit = await rateLimiter.limit(ctx, "directMessageSend", {
      key: sender._id,
    })
    if (!limit.ok) throw new Error("You are sending messages too quickly")

    let conversation = await conversationForPair(ctx, sender._id, recipient._id)
    if (conversation?.isArchived) {
      await restoreDirectConversationBetween(ctx, sender._id, recipient._id)
      conversation = await conversationForPair(ctx, sender._id, recipient._id)
    }

    if (conversation) {
      const existingConversation = conversation
      const duplicate = await ctx.db
        .query("directMessages")
        .withIndex("by_conversation_id_and_client_message_id", (q) =>
          q
            .eq("conversationId", existingConversation._id)
            .eq("clientMessageId", args.clientMessageId)
        )
        .unique()
      if (duplicate) {
        if (duplicate.senderId !== sender._id) throw new Error("Invalid message")
        return { messageId: duplicate._id, conversationId: existingConversation._id }
      }
    }

    const now = Date.now()
    if (!conversation) {
      const [participantAId, participantBId] = orderedParticipants(
        sender._id,
        recipient._id
      )
      const conversationId = await ctx.db.insert("directConversations", {
        participantAId,
        participantBId,
        isArchived: false,
        createdAt: now,
      })
      conversation = await ctx.db.get(conversationId)
      if (!conversation) throw new Error("Could not create conversation")
    }

    const messageId = await ctx.db.insert("directMessages", {
      conversationId: conversation._id,
      senderId: sender._id,
      body,
      clientMessageId: args.clientMessageId,
      createdAt: now,
    })
    const [senderMember, recipientMember] = await Promise.all([
      memberFor(ctx, conversation._id, sender._id),
      memberFor(ctx, conversation._id, recipient._id),
    ])
    if (!senderMember) {
      await ctx.db.insert("directConversationMembers", {
        conversationId: conversation._id,
        userId: sender._id,
        otherUserId: recipient._id,
        isArchived: false,
        lastMessageId: messageId,
        lastMessageAt: now,
        unreadCount: 0,
      })
    } else {
      await ctx.db.patch(senderMember._id, {
        isArchived: false,
        lastMessageId: messageId,
        lastMessageAt: now,
      })
    }
    if (!recipientMember) {
      await ctx.db.insert("directConversationMembers", {
        conversationId: conversation._id,
        userId: recipient._id,
        otherUserId: sender._id,
        isArchived: false,
        lastMessageId: messageId,
        lastMessageAt: now,
        unreadCount: 1,
      })
      await changeUnreadCount(ctx, recipient._id, 1)
    } else {
      await ctx.db.patch(recipientMember._id, {
        isArchived: false,
        lastMessageId: messageId,
        lastMessageAt: now,
        unreadCount: recipientMember.unreadCount + 1,
      })
      await changeUnreadCount(ctx, recipient._id, 1)
    }
    return { messageId, conversationId: conversation._id }
  },
})

export const markConversationRead = mutation({
  args: { conversationId: v.id("directConversations") },
  handler: async (ctx, args) => {
    const viewer = await currentOnboardedUser(ctx)
    const member = await memberFor(ctx, args.conversationId, viewer._id)
    if (!member) throw new Error("Conversation not found")
    if (member.unreadCount === 0) return null

    await ctx.db.patch(member._id, { unreadCount: 0 })
    await changeUnreadCount(ctx, viewer._id, -member.unreadCount)
    return null
  },
})

export const setReaction = mutation({
  args: { messageId: v.id("directMessages"), emoji: v.optional(reactionValidator) },
  handler: async (ctx, args) => {
    const viewer = await currentOnboardedUser(ctx)
    const message = await ctx.db.get(args.messageId)
    if (!message) throw new Error("Message not found")
    const conversation = await ctx.db.get(message.conversationId)
    if (!conversation || conversation.isArchived)
      throw new Error("Messaging is unavailable for this connection")
    const member = await memberFor(ctx, conversation._id, viewer._id)
    if (!member || !(await canMessage(ctx, viewer._id, member.otherUserId))) {
      throw new Error("Messaging is unavailable for this connection")
    }

    const limit = await rateLimiter.limit(ctx, "directMessageReaction", {
      key: viewer._id,
    })
    if (!limit.ok) throw new Error("You are reacting too quickly")

    const existing = await ctx.db
      .query("directMessageReactions")
      .withIndex("by_message_id_and_user_id", (q) =>
        q.eq("messageId", message._id).eq("userId", viewer._id)
      )
      .unique()
    if (!args.emoji) {
      if (existing) await ctx.db.delete(existing._id)
      return null
    }
    if (existing?.emoji === args.emoji) {
      await ctx.db.delete(existing._id)
      return null
    }
    if (existing) {
      await ctx.db.patch(existing._id, { emoji: args.emoji })
      return null
    }
    await ctx.db.insert("directMessageReactions", {
      messageId: message._id,
      userId: viewer._id,
      emoji: args.emoji,
      createdAt: Date.now(),
    })
    return null
  },
})

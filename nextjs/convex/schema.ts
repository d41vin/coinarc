import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    authProvider: v.union(v.literal("circle"), v.literal("siwe")),
    contactEmail: v.optional(v.string()),
    displayName: v.optional(v.string()),
    username: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    avatarKey: v.optional(v.string()),
    onboardingComplete: v.boolean(),
  })
    .index("by_token_identifier", ["tokenIdentifier"])
    .index("by_username", ["username"])
    .searchIndex("search_username", {
      searchField: "username",
      filterFields: ["onboardingComplete"],
    })
    .searchIndex("search_display_name", {
      searchField: "displayName",
      filterFields: ["onboardingComplete"],
    }),
  identities: defineTable({
    userId: v.id("users"),
    provider: v.union(v.literal("circle"), v.literal("siwe")),
    externalId: v.string(),
  })
    .index("by_provider_and_external_id", ["provider", "externalId"])
    .index("by_user_id", ["userId"]),
  wallets: defineTable({
    userId: v.id("users"),
    address: v.string(),
    chainId: v.number(),
    custody: v.union(v.literal("circle"), v.literal("external")),
    circleWalletId: v.optional(v.string()),
    primaryReceiving: v.boolean(),
  })
    .index("by_address", ["address"])
    .index("by_user_id", ["userId"]),
  payments: defineTable({
    senderId: v.id("users"),
    recipientUserId: v.optional(v.id("users")),
    sourceWalletAddress: v.string(),
    sourceCustody: v.union(v.literal("circle"), v.literal("external")),
    circleWalletId: v.optional(v.string()),
    destinationAddress: v.string(),
    amountBaseUnits: v.string(),
    clientRequestId: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("awaiting-approval"),
      v.literal("submitted"),
      v.literal("confirmed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    circleChallengeId: v.optional(v.string()),
    circleTransactionId: v.optional(v.string()),
    txHash: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    createdAt: v.number(),
    submittedAt: v.optional(v.number()),
    confirmedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
  })
    .index("by_sender_id_and_client_request_id", [
      "senderId",
      "clientRequestId",
    ])
    .index("by_sender_id_and_created_at", ["senderId", "createdAt"])
    .index("by_recipient_id_and_created_at", ["recipientUserId", "createdAt"])
    .index("by_tx_hash", ["txHash"]),
  paymentNotes: defineTable({
    paymentId: v.id("payments"),
    senderId: v.id("users"),
    recipientId: v.id("users"),
    body: v.string(),
    createdAt: v.number(),
  }).index("by_payment_id", ["paymentId"]),
  activityItems: defineTable({
    userId: v.id("users"),
    actorId: v.id("users"),
    type: v.union(v.literal("payment-sent"), v.literal("payment-received")),
    source: v.object({ type: v.literal("payment"), id: v.id("payments") }),
    createdAt: v.number(),
  }).index("by_user_id_and_created_at", ["userId", "createdAt"]),
  homePreferences: defineTable({
    userId: v.id("users"),
    pinnedActions: v.array(
      v.union(
        v.literal("payment-link"),
        v.literal("claim-link"),
        v.literal("schedule-payment"),
        v.literal("recurring-payment"),
        v.literal("request-payment")
      )
    ),
  }).index("by_user_id", ["userId"]),
  friendRequests: defineTable({
    senderId: v.id("users"),
    recipientId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_sender_id_and_recipient_id", ["senderId", "recipientId"])
    .index("by_recipient_id_and_sender_id", ["recipientId", "senderId"]),
  friendships: defineTable({
    userId: v.id("users"),
    friendId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_user_id_and_friend_id", ["userId", "friendId"])
    .index("by_user_id_and_created_at", ["userId", "createdAt"]),
  userBlocks: defineTable({
    blockerId: v.id("users"),
    blockedId: v.id("users"),
    createdAt: v.number(),
  }).index("by_blocker_id_and_blocked_id", ["blockerId", "blockedId"]),
  directConversations: defineTable({
    participantAId: v.id("users"),
    participantBId: v.id("users"),
    isArchived: v.boolean(),
    createdAt: v.number(),
    archivedAt: v.optional(v.number()),
  }).index("by_participant_a_id_and_participant_b_id", [
    "participantAId",
    "participantBId",
  ]),
  directConversationMembers: defineTable({
    conversationId: v.id("directConversations"),
    userId: v.id("users"),
    otherUserId: v.id("users"),
    isArchived: v.boolean(),
    lastMessageId: v.id("directMessages"),
    lastMessageAt: v.number(),
    unreadCount: v.number(),
  })
    .index("by_conversation_id", ["conversationId"])
    .index("by_conversation_id_and_user_id", ["conversationId", "userId"])
    .index("by_user_id_and_is_archived_and_last_message_at", [
      "userId",
      "isArchived",
      "lastMessageAt",
    ]),
  directMessages: defineTable({
    conversationId: v.id("directConversations"),
    senderId: v.id("users"),
    body: v.string(),
    clientMessageId: v.string(),
    createdAt: v.number(),
  })
    .index("by_conversation_id_and_created_at", ["conversationId", "createdAt"])
    .index("by_conversation_id_and_client_message_id", [
      "conversationId",
      "clientMessageId",
    ]),
  directMessageReactions: defineTable({
    messageId: v.id("directMessages"),
    userId: v.id("users"),
    emoji: v.union(
      v.literal("👍"),
      v.literal("❤️"),
      v.literal("😂"),
      v.literal("👀")
    ),
    createdAt: v.number(),
  }).index("by_message_id_and_user_id", ["messageId", "userId"]),
  directMessageStates: defineTable({
    userId: v.id("users"),
    unreadCount: v.number(),
  }).index("by_user_id", ["userId"]),
  notifications: defineTable({
    recipientId: v.id("users"),
    actorId: v.id("users"),
    type: v.union(
      v.literal("friend-request-received"),
      v.literal("friend-request-accepted"),
      v.literal("friend-request-declined"),
      v.literal("payment-received")
    ),
    source: v.union(
      v.object({
        type: v.literal("friend-request"),
        id: v.id("friendRequests"),
      }),
      v.object({ type: v.literal("payment"), id: v.id("payments") })
    ),
    createdAt: v.number(),
    isRead: v.boolean(),
    readAt: v.optional(v.number()),
  })
    .index("by_recipient_id_and_created_at", ["recipientId", "createdAt"])
    .index("by_recipient_id_and_is_read", ["recipientId", "isRead"])
    .index("by_source_id", ["source.id"]),
  notificationStates: defineTable({
    userId: v.id("users"),
    unreadCount: v.number(),
  }).index("by_user_id", ["userId"]),
  circleOtpAttempts: defineTable({
    attemptId: v.string(),
    email: v.string(),
    deviceId: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
  }).index("by_attempt_id", ["attemptId"]),
  siweNonces: defineTable({
    nonce: v.string(),
    purpose: v.optional(
      v.union(v.literal("sign-in"), v.literal("wallet-link"))
    ),
    createdAt: v.number(),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
  }).index("by_nonce", ["nonce"]),
})

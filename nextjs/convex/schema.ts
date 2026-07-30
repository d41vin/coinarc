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
  notifications: defineTable({
    recipientId: v.id("users"),
    actorId: v.id("users"),
    type: v.union(
      v.literal("friend-request-received"),
      v.literal("friend-request-accepted"),
      v.literal("friend-request-declined")
    ),
    source: v.object({
      type: v.literal("friend-request"),
      id: v.id("friendRequests"),
    }),
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

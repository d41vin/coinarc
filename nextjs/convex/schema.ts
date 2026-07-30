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

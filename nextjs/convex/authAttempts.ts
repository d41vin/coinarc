import { mutation } from "./_generated/server"
import { v } from "convex/values"
import { MINUTE, HOUR, RateLimiter } from "@convex-dev/rate-limiter"
import { components } from "./_generated/api"

const TEN_MINUTES = 10 * 60 * 1000

const rateLimiter = new RateLimiter(
  (components as { rateLimiter: never }).rateLimiter,
  {
    circleOtpGlobal: {
      kind: "token bucket",
      rate: 60,
      period: MINUTE,
      capacity: 120,
    },
    circleOtpPerEmail: {
      kind: "fixed window",
      rate: 3,
      period: 15 * MINUTE,
    },
    circleOtpPerDevice: {
      kind: "fixed window",
      rate: 10,
      period: HOUR,
    },
  }
)

type RateLimitStatus = { ok: boolean; retryAfter?: number }

function blockedRetryAfterMs(...statuses: RateLimitStatus[]) {
  const blocked = statuses.filter((status) => !status.ok)
  if (!blocked.length) return null

  return Math.max(...blocked.map((status) => status.retryAfter ?? 0), 1_000)
}

export const createCircleOtpAttempt = mutation({
  args: { attemptId: v.string(), email: v.string(), deviceId: v.string() },
  handler: async (ctx, args) => {
    const emailStatus = await rateLimiter.check(ctx, "circleOtpPerEmail", {
      key: args.email,
    })
    const deviceStatus = await rateLimiter.check(ctx, "circleOtpPerDevice", {
      key: args.deviceId,
    })
    const globalStatus = await rateLimiter.check(ctx, "circleOtpGlobal")
    const retryAfter = blockedRetryAfterMs(
      emailStatus,
      deviceStatus,
      globalStatus
    )
    if (retryAfter !== null) return { allowed: false, retryAfterMs: retryAfter }

    const emailLimit = await rateLimiter.limit(ctx, "circleOtpPerEmail", {
      key: args.email,
    })
    const deviceLimit = await rateLimiter.limit(ctx, "circleOtpPerDevice", {
      key: args.deviceId,
    })
    const globalLimit = await rateLimiter.limit(ctx, "circleOtpGlobal")
    const concurrentRetryAfter = blockedRetryAfterMs(
      emailLimit,
      deviceLimit,
      globalLimit
    )
    if (concurrentRetryAfter !== null) {
      return { allowed: false, retryAfterMs: concurrentRetryAfter }
    }

    const now = Date.now()
    const existing = await ctx.db
      .query("circleOtpAttempts")
      .withIndex("by_attempt_id", (q) => q.eq("attemptId", args.attemptId))
      .unique()
    if (existing) throw new Error("OTP attempt collision")
    await ctx.db.insert("circleOtpAttempts", {
      ...args,
      createdAt: now,
      expiresAt: now + TEN_MINUTES,
    })
    return { allowed: true, retryAfterMs: null }
  },
})

export const consumeCircleOtpAttempt = mutation({
  args: { attemptId: v.string(), deviceId: v.string() },
  handler: async (ctx, args) => {
    const attempt = await ctx.db
      .query("circleOtpAttempts")
      .withIndex("by_attempt_id", (q) => q.eq("attemptId", args.attemptId))
      .unique()
    const now = Date.now()
    if (
      !attempt ||
      attempt.consumedAt !== undefined ||
      attempt.expiresAt <= now ||
      attempt.deviceId !== args.deviceId
    )
      throw new Error("Invalid or expired OTP attempt")
    await ctx.db.patch(attempt._id, { consumedAt: now })
    return { email: attempt.email }
  },
})

export const createSiweNonce = mutation({
  args: {
    nonce: v.string(),
    purpose: v.union(v.literal("sign-in"), v.literal("wallet-link")),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const existing = await ctx.db
      .query("siweNonces")
      .withIndex("by_nonce", (q) => q.eq("nonce", args.nonce))
      .unique()
    if (existing) throw new Error("SIWE nonce collision")
    await ctx.db.insert("siweNonces", {
      nonce: args.nonce,
      purpose: args.purpose,
      createdAt: now,
      expiresAt: now + TEN_MINUTES,
    })
    return null
  },
})

export const consumeSiweNonce = mutation({
  args: {
    nonce: v.string(),
    purpose: v.union(v.literal("sign-in"), v.literal("wallet-link")),
  },
  handler: async (ctx, args) => {
    const nonce = await ctx.db
      .query("siweNonces")
      .withIndex("by_nonce", (q) => q.eq("nonce", args.nonce))
      .unique()
    const now = Date.now()
    if (
      !nonce ||
      nonce.purpose !== args.purpose ||
      nonce.consumedAt !== undefined ||
      nonce.expiresAt <= now
    )
      throw new Error("Invalid or expired SIWE nonce")
    await ctx.db.patch(nonce._id, { consumedAt: now })
    return null
  },
})

import { mutation } from "./_generated/server"
import { v } from "convex/values"

const TEN_MINUTES = 10 * 60 * 1000

export const createCircleOtpAttempt = mutation({ args: { attemptId: v.string(), email: v.string(), deviceId: v.string() }, handler: async (ctx, args) => {
  const now = Date.now()
  const existing = await ctx.db.query("circleOtpAttempts").withIndex("by_attempt_id", (q) => q.eq("attemptId", args.attemptId)).unique()
  if (existing) throw new Error("OTP attempt collision")
  await ctx.db.insert("circleOtpAttempts", { ...args, createdAt: now, expiresAt: now + TEN_MINUTES })
  return null
} })

export const consumeCircleOtpAttempt = mutation({ args: { attemptId: v.string(), deviceId: v.string() }, handler: async (ctx, args) => {
  const attempt = await ctx.db.query("circleOtpAttempts").withIndex("by_attempt_id", (q) => q.eq("attemptId", args.attemptId)).unique()
  const now = Date.now()
  if (!attempt || attempt.consumedAt !== undefined || attempt.expiresAt <= now || attempt.deviceId !== args.deviceId) throw new Error("Invalid or expired OTP attempt")
  await ctx.db.patch(attempt._id, { consumedAt: now })
  return { email: attempt.email }
} })

export const createSiweNonce = mutation({ args: { nonce: v.string() }, handler: async (ctx, args) => {
  const now = Date.now()
  const existing = await ctx.db.query("siweNonces").withIndex("by_nonce", (q) => q.eq("nonce", args.nonce)).unique()
  if (existing) throw new Error("SIWE nonce collision")
  await ctx.db.insert("siweNonces", { nonce: args.nonce, createdAt: now, expiresAt: now + TEN_MINUTES })
  return null
} })

export const consumeSiweNonce = mutation({ args: { nonce: v.string() }, handler: async (ctx, args) => {
  const nonce = await ctx.db.query("siweNonces").withIndex("by_nonce", (q) => q.eq("nonce", args.nonce)).unique()
  const now = Date.now()
  if (!nonce || nonce.consumedAt !== undefined || nonce.expiresAt <= now) throw new Error("Invalid or expired SIWE nonce")
  await ctx.db.patch(nonce._id, { consumedAt: now })
  return null
} })

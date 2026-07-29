import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

const reserved = new Set(["admin", "support", "coinarc", "api", "home", "settings", "onboarding", "wallet"])
function identity(ctx: { auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string; subject: string; email?: string } | null> } }) { return ctx.auth.getUserIdentity() }
function validUsername(username: string) { return /^[a-z0-9](?:[a-z0-9]|_(?!_)){2,18}[a-z0-9]$/.test(username) && !reserved.has(username) }

export const ensureForSession = mutation({ args: {}, handler: async (ctx) => {
  const auth = await identity(ctx); if (!auth) throw new Error("Unauthorized")
  // @ts-expect-error Convex bindings are generated on the next Convex deploy.
  const existing = await ctx.db.query("users").withIndex("by_token_identifier", q => q.eq("tokenIdentifier", auth.tokenIdentifier)).unique()
  if (existing) return { onboardingComplete: existing.onboardingComplete }
  const provider = auth.subject.startsWith("circle:") ? "circle" : "siwe"
  const id = await ctx.db.insert("users", { tokenIdentifier: auth.tokenIdentifier, authProvider: provider, contactEmail: provider === "circle" ? auth.email : undefined, onboardingComplete: false })
  await ctx.db.insert("identities", { userId: id, provider, externalId: auth.subject.slice(auth.subject.indexOf(":") + 1) })
  return { onboardingComplete: false }
} })

export const current = query({ args: {}, handler: async (ctx) => {
  const auth = await identity(ctx); if (!auth) return null
  // @ts-expect-error Convex bindings are generated on the next Convex deploy.
  return await ctx.db.query("users").withIndex("by_token_identifier", q => q.eq("tokenIdentifier", auth.tokenIdentifier)).unique()
} })

export const completeOnboarding = mutation({ args: { displayName: v.string(), username: v.string() }, handler: async (ctx, args) => {
  const auth = await identity(ctx); if (!auth) throw new Error("Unauthorized")
  const displayName = args.displayName.trim(); const username = args.username.trim().toLowerCase()
  if (!displayName || displayName.length > 80) throw new Error("Display name is required and must be 80 characters or fewer")
  if (!validUsername(username)) throw new Error("Username must follow the required format")
  // @ts-expect-error Convex bindings are generated on the next Convex deploy.
  const user = await ctx.db.query("users").withIndex("by_token_identifier", q => q.eq("tokenIdentifier", auth.tokenIdentifier)).unique(); if (!user) throw new Error("Profile not found")
  // @ts-expect-error Convex bindings are generated on the next Convex deploy.
  const duplicate = await ctx.db.query("users").withIndex("by_username", q => q.eq("username", username)).unique(); if (duplicate && duplicate._id !== user._id) throw new Error("That username is already taken")
  await ctx.db.patch(user._id, { displayName, username, onboardingComplete: true }); return null
} })

export const setAvatar = mutation({ args: { avatarUrl: v.string(), avatarKey: v.string() }, handler: async (ctx, args) => {
  const auth = await identity(ctx); if (!auth) throw new Error("Unauthorized")
  // @ts-expect-error Convex bindings are generated on the next Convex deploy.
  const user = await ctx.db.query("users").withIndex("by_token_identifier", q => q.eq("tokenIdentifier", auth.tokenIdentifier)).unique(); if (!user) throw new Error("Profile not found")
  await ctx.db.patch(user._id, args); return null
} })

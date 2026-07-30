import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import type { Id } from "./_generated/dataModel"

const reserved = new Set([
  "admin",
  "support",
  "coinarc",
  "api",
  "home",
  "settings",
  "onboarding",
  "wallet",
])
const ARC_TESTNET_CHAIN_ID = 5_042_002

type CoinArcIdentity = {
  tokenIdentifier: string
  subject: string
  email?: string
  walletAddress?: unknown
  walletChainId?: unknown
  walletCustody?: unknown
  circleWalletId?: unknown
}

type VerifiedWallet = {
  address: string
  chainId: number
  custody: "circle" | "external"
  circleWalletId?: string
}

function identity(ctx: {
  auth: { getUserIdentity: () => Promise<CoinArcIdentity | null> }
}) {
  return ctx.auth.getUserIdentity()
}
function validUsername(username: string) {
  return (
    /^[a-z0-9](?:[a-z0-9]|_(?!_)){2,18}[a-z0-9]$/.test(username) &&
    !reserved.has(username)
  )
}

function verifiedWallet(
  auth: CoinArcIdentity,
  provider: "circle" | "siwe"
): VerifiedWallet | null {
  if (
    typeof auth.walletAddress !== "string" ||
    !/^0x[a-fA-F0-9]{40}$/.test(auth.walletAddress) ||
    auth.walletChainId !== ARC_TESTNET_CHAIN_ID ||
    (auth.walletCustody !== "circle" && auth.walletCustody !== "external")
  )
    return null
  const address = auth.walletAddress.toLowerCase()
  if (provider === "siwe")
    return auth.walletCustody === "external" &&
      auth.circleWalletId === undefined &&
      auth.subject === `siwe:${address}`
      ? { address, chainId: ARC_TESTNET_CHAIN_ID, custody: "external" }
      : null
  return auth.walletCustody === "circle" &&
    typeof auth.circleWalletId === "string"
    ? {
        address,
        chainId: ARC_TESTNET_CHAIN_ID,
        custody: "circle",
        circleWalletId: auth.circleWalletId,
      }
    : null
}

function authProvider(auth: CoinArcIdentity) {
  return auth.subject.startsWith("circle:") ? "circle" : "siwe"
}

async function currentUser(
  ctx: MutationCtx | QueryCtx,
  auth: CoinArcIdentity,
  wallet = verifiedWallet(auth, authProvider(auth))
) {
  const directUser = await ctx.db
    .query("users")
    .withIndex("by_token_identifier", (q) =>
      q.eq("tokenIdentifier", auth.tokenIdentifier)
    )
    .unique()
  if (directUser) return directUser

  if (!wallet || wallet.custody !== "external") return null
  const linkedWallet = await ctx.db
    .query("wallets")
    .withIndex("by_address", (q) => q.eq("address", wallet.address))
    .unique()
  return linkedWallet ? await ctx.db.get(linkedWallet.userId) : null
}

async function ensureVerifiedWallet(
  ctx: MutationCtx,
  userId: Id<"users">,
  wallet: VerifiedWallet
) {
  const existing = await ctx.db
    .query("wallets")
    .withIndex("by_address", (q) => q.eq("address", wallet.address))
    .unique()
  if (existing) {
    if (existing.userId !== userId)
      throw new Error(
        "This wallet is already linked to another CoinArc account"
      )
    return
  }
  const userWallets = await ctx.db
    .query("wallets")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .take(20)
  if (userWallets.length >= 20)
    throw new Error("You can link up to 20 wallets to one CoinArc account")
  await ctx.db.insert("wallets", {
    userId,
    ...wallet,
    primaryReceiving: !userWallets.some(
      (existingWallet) => existingWallet.primaryReceiving
    ),
  })
}

export const ensureForSession = mutation({
  args: {},
  handler: async (ctx) => {
    const auth = await identity(ctx)
    if (!auth) throw new Error("Unauthorized")
    const provider = authProvider(auth)
    const wallet = verifiedWallet(auth, provider)
    let user = await currentUser(ctx, auth, wallet)
    if (!user) {
      const id = await ctx.db.insert("users", {
        tokenIdentifier: auth.tokenIdentifier,
        authProvider: provider,
        contactEmail: provider === "circle" ? auth.email : undefined,
        onboardingComplete: false,
      })
      await ctx.db.insert("identities", {
        userId: id,
        provider,
        externalId: auth.subject.slice(auth.subject.indexOf(":") + 1),
      })
      user = await ctx.db.get(id)
      if (!user) throw new Error("Could not create CoinArc profile")
    }
    if (wallet) await ensureVerifiedWallet(ctx, user._id, wallet)
    return { onboardingComplete: user.onboardingComplete }
  },
})

export const current = query({
  args: {},
  handler: async (ctx) => {
    const auth = await identity(ctx)
    if (!auth) return null
    return await currentUser(ctx, auth)
  },
})

export const settings = query({
  args: {},
  handler: async (ctx) => {
    const auth = await identity(ctx)
    if (!auth) throw new Error("Unauthorized")
    const user = await currentUser(ctx, auth)
    if (!user) return null
    const wallets = await ctx.db
      .query("wallets")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .take(20)
    return { user, wallets }
  },
})

export const completeOnboarding = mutation({
  args: { displayName: v.string(), username: v.string() },
  handler: async (ctx, args) => {
    const auth = await identity(ctx)
    if (!auth) throw new Error("Unauthorized")
    const displayName = args.displayName.trim()
    const username = args.username.trim().toLowerCase()
    if (!displayName || displayName.length > 80)
      throw new Error(
        "Display name is required and must be 80 characters or fewer"
      )
    if (!validUsername(username))
      throw new Error("Username must follow the required format")
    const user = await currentUser(ctx, auth)
    if (!user) throw new Error("Profile not found")
    const duplicate = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique()
    if (duplicate && duplicate._id !== user._id)
      throw new Error("That username is already taken")
    await ctx.db.patch(user._id, {
      displayName,
      username,
      onboardingComplete: true,
    })
    return null
  },
})

export const updateProfile = mutation({
  args: { displayName: v.string(), username: v.string() },
  handler: async (ctx, args) => {
    const auth = await identity(ctx)
    if (!auth) throw new Error("Unauthorized")
    const displayName = args.displayName.trim()
    const username = args.username.trim().toLowerCase()
    if (!displayName || displayName.length > 80)
      throw new Error(
        "Display name is required and must be 80 characters or fewer"
      )
    if (!validUsername(username))
      throw new Error("Username must follow the required format")
    const user = await currentUser(ctx, auth)
    if (!user) throw new Error("Profile not found")
    const duplicate = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique()
    if (duplicate && duplicate._id !== user._id)
      throw new Error("That username is already taken")
    await ctx.db.patch(user._id, { displayName, username })
    return null
  },
})

export const setAvatar = mutation({
  args: { avatarUrl: v.string(), avatarKey: v.string() },
  handler: async (ctx, args) => {
    const auth = await identity(ctx)
    if (!auth) throw new Error("Unauthorized")
    const user = await currentUser(ctx, auth)
    if (!user) throw new Error("Profile not found")
    await ctx.db.patch(user._id, args)
    return null
  },
})

export const setPrimaryReceivingWallet = mutation({
  args: { walletId: v.id("wallets") },
  handler: async (ctx, args) => {
    const auth = await identity(ctx)
    if (!auth) throw new Error("Unauthorized")
    const user = await currentUser(ctx, auth)
    if (!user) throw new Error("Profile not found")
    const selected = await ctx.db.get(args.walletId)
    if (!selected || selected.userId !== user._id)
      throw new Error("Wallet not found")
    const wallets = await ctx.db
      .query("wallets")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .take(20)
    for (const wallet of wallets) {
      const primaryReceiving = wallet._id === selected._id
      if (wallet.primaryReceiving !== primaryReceiving)
        await ctx.db.patch(wallet._id, { primaryReceiving })
    }
    return null
  },
})

export const linkExternalWallet = mutation({
  args: { address: v.string(), chainId: v.number() },
  handler: async (ctx, args) => {
    const auth = await identity(ctx)
    if (!auth) throw new Error("Unauthorized")
    const user = await currentUser(ctx, auth)
    if (!user) throw new Error("Profile not found")
    if (
      args.chainId !== ARC_TESTNET_CHAIN_ID ||
      !/^0x[a-fA-F0-9]{40}$/.test(args.address)
    )
      throw new Error("Invalid external wallet")

    const address = args.address.toLowerCase()
    await ensureVerifiedWallet(ctx, user._id, {
      address,
      chainId: ARC_TESTNET_CHAIN_ID,
      custody: "external",
    })

    const existingIdentity = await ctx.db
      .query("identities")
      .withIndex("by_provider_and_external_id", (q) =>
        q.eq("provider", "siwe").eq("externalId", address)
      )
      .unique()
    if (existingIdentity && existingIdentity.userId !== user._id)
      throw new Error(
        "This wallet is already linked to another CoinArc account"
      )
    if (!existingIdentity)
      await ctx.db.insert("identities", {
        userId: user._id,
        provider: "siwe",
        externalId: address,
      })
    return null
  },
})

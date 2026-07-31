import { query } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import type { QueryCtx } from "./_generated/server"

const ARC_TESTNET_CHAIN_ID = 5_042_002
const MAX_ACTIVITY_ITEMS = 100

type CoinArcIdentity = {
  tokenIdentifier: string
  subject: string
  walletAddress?: unknown
  walletChainId?: unknown
  walletCustody?: unknown
  circleWalletId?: unknown
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

async function currentUser(ctx: QueryCtx, auth: CoinArcIdentity) {
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

async function profileFor(ctx: QueryCtx, userId: Id<"users">) {
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

export const list = query({
  args: {},
  handler: async (ctx) => {
    const auth = await identity(ctx)
    if (!auth) return []
    const viewer = await currentUser(ctx, auth)
    if (!viewer?.onboardingComplete) return []
    const activityItems = await ctx.db
      .query("activityItems")
      .withIndex("by_user_id_and_created_at", (q) => q.eq("userId", viewer._id))
      .order("desc")
      .take(MAX_ACTIVITY_ITEMS)

    const hydrated = await Promise.all(
      activityItems.map(async (item) => {
        const payment = await ctx.db.get(item.source.id)
        if (!payment || payment.status !== "confirmed") return null
        const isSent = item.type === "payment-sent"
        const counterpartyId = isSent
          ? payment.recipientUserId
          : payment.senderId
        return {
          id: item._id,
          type: item.type,
          paymentId: payment._id,
          createdAt: item.createdAt,
          amountBaseUnits: payment.amountBaseUnits,
          destinationAddress: payment.destinationAddress,
          counterparty: counterpartyId
            ? await profileFor(ctx, counterpartyId)
            : null,
        }
      })
    )

    return hydrated.filter(
      (item): item is NonNullable<(typeof hydrated)[number]> => item !== null
    )
  },
})

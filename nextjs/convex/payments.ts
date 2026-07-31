import { v } from "convex/values"
import { paginationOptsValidator } from "convex/server"

import { mutation, query } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { createPaymentReceivedNotification } from "./notifications"

const ARC_TESTNET_CHAIN_ID = 5_042_002
const MAX_SEARCH_RESULTS = 8
const MAX_NOTE_LENGTH = 280

type CoinArcIdentity = {
  tokenIdentifier: string
  subject: string
  walletAddress?: unknown
  walletChainId?: unknown
  walletCustody?: unknown
  circleWalletId?: unknown
  paymentReconciliation?: unknown
}

type VerifiedWallet = {
  address: string
  custody: "circle" | "external"
  circleWalletId?: string
}

type Profile = {
  avatarUrl?: string
  displayName: string
  username: string
}

function identity(ctx: {
  auth: { getUserIdentity: () => Promise<CoinArcIdentity | null> }
}) {
  return ctx.auth.getUserIdentity()
}

function authProvider(auth: CoinArcIdentity) {
  return auth.subject.startsWith("circle:") ? "circle" : "siwe"
}

function verifiedWallet(auth: CoinArcIdentity): VerifiedWallet | null {
  if (
    typeof auth.walletAddress !== "string" ||
    !/^0x[a-fA-F0-9]{40}$/.test(auth.walletAddress) ||
    auth.walletChainId !== ARC_TESTNET_CHAIN_ID ||
    (auth.walletCustody !== "circle" && auth.walletCustody !== "external")
  ) {
    return null
  }

  const address = auth.walletAddress.toLowerCase()
  if (authProvider(auth) === "circle") {
    return auth.walletCustody === "circle" &&
      typeof auth.circleWalletId === "string"
      ? { address, custody: "circle", circleWalletId: auth.circleWalletId }
      : null
  }

  return auth.walletCustody === "external" &&
    auth.circleWalletId === undefined &&
    auth.subject === `siwe:${address}`
    ? { address, custody: "external" }
    : null
}

async function currentUser(
  ctx: MutationCtx | QueryCtx,
  auth: CoinArcIdentity,
  wallet: VerifiedWallet | null
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

async function currentOnboardedUser(ctx: MutationCtx | QueryCtx) {
  const auth = await identity(ctx)
  if (!auth) throw new Error("Unauthorized")
  const wallet = verifiedWallet(auth)
  if (!wallet) throw new Error("Your Arc Testnet wallet is unavailable")
  const user = await currentUser(ctx, auth, wallet)
  if (!user?.onboardingComplete) throw new Error("Complete onboarding first")
  return { user, wallet }
}

async function currentPaymentReconciler(ctx: MutationCtx | QueryCtx) {
  const auth = await identity(ctx)
  if (!auth || auth.paymentReconciliation !== true) {
    throw new Error("Payment confirmation is server-only")
  }
  return await currentOnboardedUser(ctx)
}

function normalizeUsername(username: string) {
  return username.trim().replace(/^@+/, "").toLowerCase()
}

function normalizeAddress(address: string) {
  const trimmed = address.trim()
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    throw new Error("Enter a valid Arc Testnet wallet address")
  }
  return trimmed.toLowerCase()
}

function validBaseUnits(amountBaseUnits: string) {
  if (!/^[1-9]\d*$/.test(amountBaseUnits)) {
    throw new Error("Enter a valid USDC amount")
  }
  const amount = BigInt(amountBaseUnits)
  // Reject accidental UI or API values that are implausibly large while still
  // keeping monetary arithmetic exact and independent of JavaScript numbers.
  if (amount > BigInt(10) ** BigInt(24)) {
    throw new Error("Payment amount is too large")
  }
  return amountBaseUnits
}

async function profileFor(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">
): Promise<Profile | null> {
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

async function primaryWalletFor(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">
) {
  const wallets = await ctx.db
    .query("wallets")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .take(20)
  return (
    wallets.find(
      (wallet) =>
        wallet.primaryReceiving && wallet.chainId === ARC_TESTNET_CHAIN_ID
    ) ?? null
  )
}

async function isBlocked(
  ctx: MutationCtx | QueryCtx,
  firstUserId: Id<"users">,
  secondUserId: Id<"users">
) {
  const [firstBlock, secondBlock] = await Promise.all([
    ctx.db
      .query("userBlocks")
      .withIndex("by_blocker_id_and_blocked_id", (q) =>
        q.eq("blockerId", firstUserId).eq("blockedId", secondUserId)
      )
      .unique(),
    ctx.db
      .query("userBlocks")
      .withIndex("by_blocker_id_and_blocked_id", (q) =>
        q.eq("blockerId", secondUserId).eq("blockedId", firstUserId)
      )
      .unique(),
  ])
  return Boolean(firstBlock || secondBlock)
}

async function isFriend(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  friendId: Id<"users">
) {
  return Boolean(
    await ctx.db
      .query("friendships")
      .withIndex("by_user_id_and_friend_id", (q) =>
        q.eq("userId", userId).eq("friendId", friendId)
      )
      .unique()
  )
}

async function recipientForUserId(
  ctx: MutationCtx | QueryCtx,
  senderId: Id<"users">,
  recipientId: Id<"users">
) {
  const recipient = await ctx.db.get(recipientId)
  if (
    !recipient ||
    !recipient.onboardingComplete ||
    !recipient.displayName ||
    !recipient.username
  ) {
    throw new Error("CoinArc member not found")
  }
  if (recipient._id === senderId) throw new Error("You cannot pay yourself")
  if (await isBlocked(ctx, senderId, recipient._id)) {
    throw new Error("This person is unavailable for payments")
  }
  const wallet = await primaryWalletFor(ctx, recipient._id)
  if (!wallet)
    throw new Error("This person does not have an Arc receiving wallet")
  return { recipient, wallet }
}

async function paymentSummaryFor(
  ctx: QueryCtx,
  payment: {
    _id: Id<"payments">
    senderId: Id<"users">
    recipientUserId?: Id<"users">
    destinationAddress: string
    amountBaseUnits: string
    status: string
    createdAt: number
    confirmedAt?: number
    txHash?: string
  },
  viewerId: Id<"users">
) {
  const isSent = payment.senderId === viewerId
  const counterpartyId = isSent ? payment.recipientUserId : payment.senderId
  const counterparty = counterpartyId
    ? await profileFor(ctx, counterpartyId)
    : null
  return {
    id: payment._id,
    direction: isSent ? ("sent" as const) : ("received" as const),
    amountBaseUnits: payment.amountBaseUnits,
    status: payment.status,
    createdAt: payment.createdAt,
    confirmedAt: payment.confirmedAt,
    txHash: payment.txHash,
    destinationAddress: payment.destinationAddress,
    counterparty,
  }
}

export const searchRecipients = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const { user: viewer } = await currentOnboardedUser(ctx)
    const rawSearchTerm = args.query.trim()
    const searchTerm = normalizeUsername(rawSearchTerm)
    if (searchTerm.length < 2 || searchTerm.length > 80) return []

    const walletSearchTerm = rawSearchTerm.toLowerCase()
    const isWalletSearch = /^0x[a-f0-9]{4,40}$/i.test(rawSearchTerm)
    const isExactWalletSearch = /^0x[a-f0-9]{40}$/i.test(rawSearchTerm)
    const [
      exactUsername,
      usernameMatches,
      displayNameMatches,
      exactWallet,
      walletMatches,
    ] = await Promise.all([
      ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", searchTerm))
        .unique(),
      ctx.db
        .query("users")
        .withSearchIndex("search_username", (q) =>
          q.search("username", searchTerm).eq("onboardingComplete", true)
        )
        .take(MAX_SEARCH_RESULTS),
      ctx.db
        .query("users")
        .withSearchIndex("search_display_name", (q) =>
          q.search("displayName", searchTerm).eq("onboardingComplete", true)
        )
        .take(MAX_SEARCH_RESULTS),
      isExactWalletSearch
        ? ctx.db
            .query("wallets")
            .withIndex("by_address", (q) => q.eq("address", walletSearchTerm))
            .unique()
        : Promise.resolve(null),
      isWalletSearch
        ? ctx.db
            .query("wallets")
            .withSearchIndex("search_address", (q) =>
              q
                .search("address", walletSearchTerm)
                .eq("chainId", ARC_TESTNET_CHAIN_ID)
                .eq("primaryReceiving", true)
            )
            .take(MAX_SEARCH_RESULTS)
        : Promise.resolve([]),
    ])
    const walletUsers = await Promise.all(
      [
        ...(exactWallet &&
        exactWallet.chainId === ARC_TESTNET_CHAIN_ID &&
        exactWallet.primaryReceiving
          ? [exactWallet]
          : []),
        ...walletMatches,
      ].map((wallet) => ctx.db.get(wallet.userId))
    )

    const candidates = []
    const seen = new Set<Id<"users">>()
    for (const candidate of [
      exactUsername,
      ...usernameMatches,
      ...displayNameMatches,
      ...walletUsers,
    ]) {
      if (
        !candidate ||
        seen.has(candidate._id) ||
        candidate._id === viewer._id ||
        !candidate.onboardingComplete ||
        !candidate.displayName ||
        !candidate.username
      ) {
        continue
      }
      seen.add(candidate._id)
      candidates.push(candidate)
    }

    const results = await Promise.all(
      candidates.map(async (candidate) => {
        if (await isBlocked(ctx, viewer._id, candidate._id)) return null
        const wallet = await primaryWalletFor(ctx, candidate._id)
        return {
          userId: candidate._id,
          displayName: candidate.displayName!,
          username: candidate.username!,
          avatarUrl: candidate.avatarUrl,
          walletAddress: wallet?.address,
          isFriend: await isFriend(ctx, viewer._id, candidate._id),
        }
      })
    )

    return results
      .filter(
        (result): result is NonNullable<(typeof results)[number]> =>
          result !== null
      )
      .sort(
        (first, second) =>
          Number(Boolean(second.walletAddress)) -
            Number(Boolean(first.walletAddress)) ||
          Number(second.isFriend) - Number(first.isFriend)
      )
      .slice(0, MAX_SEARCH_RESULTS)
  },
})

export const createDraft = mutation({
  args: {
    recipient: v.union(
      v.object({ type: v.literal("coinarc"), userId: v.id("users") }),
      v.object({ type: v.literal("address"), address: v.string() })
    ),
    amountBaseUnits: v.string(),
    note: v.optional(v.string()),
    clientRequestId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user: sender, wallet: sourceWallet } =
      await currentOnboardedUser(ctx)
    const amountBaseUnits = validBaseUnits(args.amountBaseUnits)
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        args.clientRequestId
      )
    ) {
      throw new Error("Could not start this payment. Please try again.")
    }

    const existing = await ctx.db
      .query("payments")
      .withIndex("by_sender_id_and_client_request_id", (q) =>
        q.eq("senderId", sender._id).eq("clientRequestId", args.clientRequestId)
      )
      .unique()
    if (existing) {
      return {
        paymentId: existing._id,
        sourceWalletAddress: existing.sourceWalletAddress,
        sourceCustody: existing.sourceCustody,
        destinationAddress: existing.destinationAddress,
        recipientUserId: existing.recipientUserId,
      }
    }

    let recipientUserId: Id<"users"> | undefined
    let destinationAddress: string
    let note: string | undefined
    if (args.recipient.type === "coinarc") {
      const resolved = await recipientForUserId(
        ctx,
        sender._id,
        args.recipient.userId
      )
      recipientUserId = resolved.recipient._id
      destinationAddress = resolved.wallet.address
      const trimmedNote = args.note?.trim()
      if (trimmedNote) {
        if (trimmedNote.length > MAX_NOTE_LENGTH)
          throw new Error(
            `Private notes must be ${MAX_NOTE_LENGTH} characters or fewer`
          )
        note = trimmedNote
      }
    } else {
      if (args.note?.trim()) {
        throw new Error(
          "Private notes are available only for CoinArc recipients"
        )
      }
      destinationAddress = normalizeAddress(args.recipient.address)
    }

    if (destinationAddress === sourceWallet.address) {
      throw new Error("You cannot pay your own wallet")
    }

    const createdAt = Date.now()
    const paymentId = await ctx.db.insert("payments", {
      senderId: sender._id,
      recipientUserId,
      sourceWalletAddress: sourceWallet.address,
      sourceCustody: sourceWallet.custody,
      circleWalletId: sourceWallet.circleWalletId,
      destinationAddress,
      amountBaseUnits,
      clientRequestId: args.clientRequestId,
      status: "draft",
      createdAt,
    })
    if (note && recipientUserId) {
      await ctx.db.insert("paymentNotes", {
        paymentId,
        senderId: sender._id,
        recipientId: recipientUserId,
        body: note,
        createdAt,
      })
    }

    return {
      paymentId,
      sourceWalletAddress: sourceWallet.address,
      sourceCustody: sourceWallet.custody,
      destinationAddress,
      recipientUserId,
    }
  },
})

export const execution = query({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    const { user } = await currentOnboardedUser(ctx)
    const payment = await ctx.db.get(args.paymentId)
    if (!payment || payment.senderId !== user._id) {
      throw new Error("Payment not found")
    }
    return payment
  },
})

export const attachCircleChallenge = mutation({
  args: { paymentId: v.id("payments"), challengeId: v.string() },
  handler: async (ctx, args) => {
    const { user } = await currentPaymentReconciler(ctx)
    const payment = await ctx.db.get(args.paymentId)
    if (!payment || payment.senderId !== user._id)
      throw new Error("Payment not found")
    if (payment.sourceCustody !== "circle")
      throw new Error("This payment is not using a Circle wallet")
    if (payment.status === "confirmed") return null
    if (payment.status === "failed" || payment.status === "cancelled")
      throw new Error("This payment can no longer be approved")
    await ctx.db.patch(payment._id, {
      status: "awaiting-approval",
      circleChallengeId: args.challengeId,
    })
    return null
  },
})

export const recordSubmitted = mutation({
  args: {
    paymentId: v.id("payments"),
    txHash: v.string(),
    circleTransactionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await currentPaymentReconciler(ctx)
    const payment = await ctx.db.get(args.paymentId)
    if (!payment || payment.senderId !== user._id)
      throw new Error("Payment not found")
    if (!/^0x[a-fA-F0-9]{64}$/.test(args.txHash))
      throw new Error("Invalid transaction hash")
    if (payment.status === "confirmed") return null
    if (payment.status === "failed" || payment.status === "cancelled")
      throw new Error("This payment can no longer be submitted")
    if (payment.txHash && payment.txHash !== args.txHash.toLowerCase()) {
      throw new Error("Payment was already submitted with another transaction")
    }
    await ctx.db.patch(payment._id, {
      status: "submitted",
      txHash: args.txHash.toLowerCase(),
      circleTransactionId:
        args.circleTransactionId ?? payment.circleTransactionId,
      submittedAt: payment.submittedAt ?? Date.now(),
    })
    return null
  },
})

export const confirm = mutation({
  args: { paymentId: v.id("payments"), txHash: v.string() },
  handler: async (ctx, args) => {
    const { user } = await currentPaymentReconciler(ctx)
    const payment = await ctx.db.get(args.paymentId)
    if (!payment || payment.senderId !== user._id)
      throw new Error("Payment not found")
    if (payment.status === "confirmed") return { confirmed: true }
    if (payment.status === "failed" || payment.status === "cancelled") {
      throw new Error("This payment can no longer be confirmed")
    }
    if (payment.txHash && payment.txHash !== args.txHash.toLowerCase()) {
      throw new Error("Payment transaction does not match")
    }

    const confirmedAt = Date.now()
    await ctx.db.patch(payment._id, {
      status: "confirmed",
      txHash: args.txHash.toLowerCase(),
      submittedAt: payment.submittedAt ?? confirmedAt,
      confirmedAt,
    })
    await ctx.db.insert("activityItems", {
      userId: payment.senderId,
      actorId: payment.recipientUserId ?? payment.senderId,
      type: "payment-sent",
      source: { type: "payment", id: payment._id },
      createdAt: confirmedAt,
    })
    if (payment.recipientUserId) {
      await ctx.db.insert("activityItems", {
        userId: payment.recipientUserId,
        actorId: payment.senderId,
        type: "payment-received",
        source: { type: "payment", id: payment._id },
        createdAt: confirmedAt,
      })
      await createPaymentReceivedNotification(ctx, {
        recipientId: payment.recipientUserId,
        actorId: payment.senderId,
        paymentId: payment._id,
        createdAt: confirmedAt,
      })
    }
    return { confirmed: true }
  },
})

export const fail = mutation({
  args: { paymentId: v.id("payments"), reason: v.string() },
  handler: async (ctx, args) => {
    const { user } = await currentPaymentReconciler(ctx)
    const payment = await ctx.db.get(args.paymentId)
    if (!payment || payment.senderId !== user._id)
      throw new Error("Payment not found")
    if (payment.status === "confirmed") return null
    await ctx.db.patch(payment._id, {
      status: "failed",
      failureReason: args.reason.slice(0, 240),
      failedAt: Date.now(),
    })
    return null
  },
})

export const history = query({
  args: {
    direction: v.union(v.literal("sent"), v.literal("received")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await currentOnboardedUser(ctx)
    const result = await (args.direction === "sent"
      ? ctx.db
          .query("payments")
          .withIndex("by_sender_id_and_created_at", (q) =>
            q.eq("senderId", user._id)
          )
          .filter((q) => q.neq(q.field("status"), "draft"))
          .order("desc")
          .paginate(args.paginationOpts)
      : ctx.db
          .query("payments")
          .withIndex("by_recipient_id_and_status_and_created_at", (q) =>
            q.eq("recipientUserId", user._id).eq("status", "confirmed")
          )
          .order("desc")
          .paginate(args.paginationOpts))
    return {
      ...result,
      page: await Promise.all(
        result.page.map((payment) => paymentSummaryFor(ctx, payment, user._id))
      ),
    }
  },
})

export const details = query({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    const { user } = await currentOnboardedUser(ctx)
    const payment = await ctx.db.get(args.paymentId)
    if (
      !payment ||
      (payment.senderId !== user._id && payment.recipientUserId !== user._id)
    ) {
      throw new Error("Payment not found")
    }
    const isSent = payment.senderId === user._id
    const counterpartyId = isSent ? payment.recipientUserId : payment.senderId
    const [counterparty, note] = await Promise.all([
      counterpartyId ? profileFor(ctx, counterpartyId) : Promise.resolve(null),
      payment.recipientUserId
        ? ctx.db
            .query("paymentNotes")
            .withIndex("by_payment_id", (q) => q.eq("paymentId", payment._id))
            .unique()
        : Promise.resolve(null),
    ])
    return {
      id: payment._id,
      direction: isSent ? ("sent" as const) : ("received" as const),
      amountBaseUnits: payment.amountBaseUnits,
      status: payment.status,
      createdAt: payment.createdAt,
      submittedAt: payment.submittedAt,
      confirmedAt: payment.confirmedAt,
      failureReason: payment.failureReason,
      destinationAddress: payment.destinationAddress,
      sourceWalletAddress: payment.sourceWalletAddress,
      sourceCustody: payment.sourceCustody,
      txHash: payment.txHash,
      counterparty,
      note: isSent || payment.status === "confirmed" ? note?.body : undefined,
    }
  },
})

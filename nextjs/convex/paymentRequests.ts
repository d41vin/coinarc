import { v } from "convex/values"
import { paginationOptsValidator } from "convex/server"

import { mutation, query } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import {
  createPaymentRequestNotification,
  deleteNotificationsForPaymentRequest,
} from "./notifications"

const ARC_TESTNET_CHAIN_ID = 5_042_002
const MAX_NOTE_LENGTH = 280
const MAX_SEARCH_RESULTS = 8
const MAX_FRIENDS_TO_SEARCH = 100
const DAY_MS = 24 * 60 * 60 * 1_000

type CoinArcIdentity = {
  tokenIdentifier: string
  subject: string
  walletAddress?: unknown
  walletChainId?: unknown
  walletCustody?: unknown
  circleWalletId?: unknown
}

type Profile = {
  avatarUrl?: string
  displayName: string
  username: string
}

type PaymentRequestStatus =
  | "pending"
  | "payment-processing"
  | "completed"
  | "declined"
  | "cancelled"
  | "expired"

type PaymentRequestRecord = {
  _id: Id<"paymentRequests">
  requesterId: Id<"users">
  recipientId: Id<"users">
  requesterWalletAddress: string
  amountBaseUnits: string
  note?: string
  clientRequestId: string
  status: PaymentRequestStatus
  isOpen: boolean
  expiresAt: number
  createdAt: number
  paymentStartedAt?: number
  fulfillmentPaymentId?: Id<"payments">
  completedAt?: number
  declinedAt?: number
  cancelledAt?: number
  expiredAt?: number
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

async function currentUser(ctx: MutationCtx | QueryCtx, auth: CoinArcIdentity) {
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

async function currentOnboardedUser(ctx: MutationCtx | QueryCtx) {
  const auth = await identity(ctx)
  if (!auth) throw new Error("Unauthorized")
  const user = await currentUser(ctx, auth)
  if (!user?.onboardingComplete) throw new Error("Complete onboarding first")
  return user
}

function normalizeSearchTerm(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase()
}

function normalizeNote(note: string | undefined) {
  const trimmed = note?.trim()
  if (!trimmed) return undefined
  if (trimmed.length > MAX_NOTE_LENGTH) {
    throw new Error(
      `Private notes must be ${MAX_NOTE_LENGTH} characters or fewer`
    )
  }
  return trimmed
}

function validBaseUnits(amountBaseUnits: string) {
  if (!/^[1-9]\d*$/.test(amountBaseUnits)) {
    throw new Error("Enter a valid USDC amount")
  }
  if (BigInt(amountBaseUnits) > BigInt(10) ** BigInt(24)) {
    throw new Error("Payment amount is too large")
  }
  return amountBaseUnits
}

function validClientRequestId(clientRequestId: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      clientRequestId
    )
  ) {
    throw new Error("Could not create this request. Please try again.")
  }
}

function validExpiryDays(days: number) {
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    throw new Error("Choose an expiry between 1 and 30 days")
  }
  return days
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

function effectiveStatus(request: PaymentRequestRecord, now = Date.now()) {
  return request.status === "pending" && request.expiresAt <= now
    ? ("expired" as const)
    : request.status
}

async function expireIfDue(ctx: MutationCtx, request: PaymentRequestRecord) {
  if (effectiveStatus(request) !== "expired") return false
  await ctx.db.patch(request._id, {
    status: "expired",
    isOpen: false,
    expiredAt: request.expiredAt ?? Date.now(),
  })
  await deleteNotificationsForPaymentRequest(ctx, request._id)
  return true
}

async function openRequestBetween(
  ctx: MutationCtx,
  requesterId: Id<"users">,
  recipientId: Id<"users">
) {
  const request = await ctx.db
    .query("paymentRequests")
    .withIndex("by_requester_id_and_recipient_id_and_is_open", (q) =>
      q
        .eq("requesterId", requesterId)
        .eq("recipientId", recipientId)
        .eq("isOpen", true)
    )
    .unique()
  if (
    request &&
    request.status === "pending" &&
    (await expireIfDue(ctx, request))
  ) {
    return null
  }
  return request
}

async function summaryFor(
  ctx: QueryCtx,
  request: PaymentRequestRecord,
  viewerId: Id<"users">
) {
  const isSent = request.requesterId === viewerId
  const counterpartyId = isSent ? request.recipientId : request.requesterId
  return {
    id: request._id,
    direction: isSent ? ("sent" as const) : ("received" as const),
    amountBaseUnits: request.amountBaseUnits,
    status: effectiveStatus(request),
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
    counterparty: await profileFor(ctx, counterpartyId),
  }
}

export const searchFriends = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const viewer = await currentOnboardedUser(ctx)
    const searchTerm = normalizeSearchTerm(args.query)
    if (searchTerm.length < 2 || searchTerm.length > 80) return []

    const friendships = await ctx.db
      .query("friendships")
      .withIndex("by_user_id_and_created_at", (q) => q.eq("userId", viewer._id))
      .order("desc")
      .take(MAX_FRIENDS_TO_SEARCH)
    const candidates = await Promise.all(
      friendships.map(async (friendship) => {
        const profile = await profileFor(ctx, friendship.friendId)
        if (!profile) return null
        const matches =
          profile.displayName.toLowerCase().includes(searchTerm) ||
          profile.username.toLowerCase().includes(searchTerm)
        if (!matches) return null
        return {
          userId: friendship.friendId,
          ...profile,
          isFriend: true,
        }
      })
    )
    return candidates
      .filter(
        (candidate): candidate is NonNullable<(typeof candidates)[number]> =>
          candidate !== null
      )
      .slice(0, MAX_SEARCH_RESULTS)
  },
})

export const create = mutation({
  args: {
    recipientId: v.id("users"),
    amountBaseUnits: v.string(),
    note: v.optional(v.string()),
    expiresInDays: v.number(),
    clientRequestId: v.string(),
  },
  handler: async (ctx, args) => {
    const requester = await currentOnboardedUser(ctx)
    validClientRequestId(args.clientRequestId)
    const amountBaseUnits = validBaseUnits(args.amountBaseUnits)
    const expiresInDays = validExpiryDays(args.expiresInDays)
    if (requester._id === args.recipientId) {
      throw new Error("You cannot request payment from yourself")
    }

    const existing = await ctx.db
      .query("paymentRequests")
      .withIndex("by_requester_id_and_client_request_id", (q) =>
        q
          .eq("requesterId", requester._id)
          .eq("clientRequestId", args.clientRequestId)
      )
      .unique()
    if (existing) return { requestId: existing._id }

    const recipient = await ctx.db.get(args.recipientId)
    if (
      !recipient ||
      !recipient.onboardingComplete ||
      !recipient.displayName ||
      !recipient.username
    ) {
      throw new Error("CoinArc friend not found")
    }
    if (!(await isFriend(ctx, requester._id, recipient._id))) {
      throw new Error("You can request payment only from current friends")
    }
    if (await isBlocked(ctx, requester._id, recipient._id)) {
      throw new Error("This person is unavailable for requests")
    }
    const requesterWallet = await primaryWalletFor(ctx, requester._id)
    if (!requesterWallet) {
      throw new Error(
        "Link an Arc Testnet receiving wallet before requesting payment"
      )
    }

    const activeRequest = await openRequestBetween(
      ctx,
      requester._id,
      recipient._id
    )
    if (activeRequest?.isOpen) {
      throw new Error("You already have an active request for this friend")
    }

    const createdAt = Date.now()
    const requestId = await ctx.db.insert("paymentRequests", {
      requesterId: requester._id,
      recipientId: recipient._id,
      requesterWalletAddress: requesterWallet.address,
      amountBaseUnits,
      note: normalizeNote(args.note),
      clientRequestId: args.clientRequestId,
      status: "pending",
      isOpen: true,
      createdAt,
      expiresAt: createdAt + expiresInDays * DAY_MS,
    })
    await createPaymentRequestNotification(ctx, {
      recipientId: recipient._id,
      actorId: requester._id,
      requestId,
      type: "payment-request-received",
      createdAt,
    })
    await Promise.all([
      ctx.db.insert("activityItems", {
        userId: requester._id,
        actorId: recipient._id,
        type: "payment-request-sent",
        source: { type: "payment-request", id: requestId },
        createdAt,
      }),
      ctx.db.insert("activityItems", {
        userId: recipient._id,
        actorId: requester._id,
        type: "payment-request-received",
        source: { type: "payment-request", id: requestId },
        createdAt,
      }),
    ])
    return { requestId }
  },
})

export const history = query({
  args: {
    direction: v.union(v.literal("sent"), v.literal("received")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const viewer = await currentOnboardedUser(ctx)
    const result = await (args.direction === "sent"
      ? ctx.db
          .query("paymentRequests")
          .withIndex("by_requester_id_and_created_at", (q) =>
            q.eq("requesterId", viewer._id)
          )
          .order("desc")
          .paginate(args.paginationOpts)
      : ctx.db
          .query("paymentRequests")
          .withIndex("by_recipient_id_and_created_at", (q) =>
            q.eq("recipientId", viewer._id)
          )
          .order("desc")
          .paginate(args.paginationOpts))
    return {
      ...result,
      page: await Promise.all(
        result.page.map((request) => summaryFor(ctx, request, viewer._id))
      ),
    }
  },
})

export const details = query({
  args: { requestId: v.id("paymentRequests") },
  handler: async (ctx, args) => {
    const viewer = await currentOnboardedUser(ctx)
    const request = await ctx.db.get(args.requestId)
    if (
      !request ||
      (request.requesterId !== viewer._id && request.recipientId !== viewer._id)
    ) {
      throw new Error("Payment request not found")
    }
    const isSent = request.requesterId === viewer._id
    const counterpartyId = isSent ? request.recipientId : request.requesterId
    const [counterpartyProfile, payment] = await Promise.all([
      profileFor(ctx, counterpartyId),
      request.fulfillmentPaymentId
        ? ctx.db.get(request.fulfillmentPaymentId)
        : Promise.resolve(null),
    ])
    return {
      id: request._id,
      direction: isSent ? ("sent" as const) : ("received" as const),
      amountBaseUnits: request.amountBaseUnits,
      status: effectiveStatus(request),
      createdAt: request.createdAt,
      expiresAt: request.expiresAt,
      paymentStartedAt: request.paymentStartedAt,
      completedAt: request.completedAt,
      declinedAt: request.declinedAt,
      cancelledAt: request.cancelledAt,
      expiredAt: request.expiredAt,
      requesterWalletAddress: request.requesterWalletAddress,
      counterparty: counterpartyProfile
        ? {
            userId: counterpartyId,
            ...counterpartyProfile,
            isFriend: true as const,
          }
        : null,
      note: request.note,
      payment: payment
        ? {
            id: payment._id,
            status: payment.status,
            txHash: payment.txHash,
            confirmedAt: payment.confirmedAt,
          }
        : null,
    }
  },
})

export const decline = mutation({
  args: { requestId: v.id("paymentRequests") },
  handler: async (ctx, args) => {
    const recipient = await currentOnboardedUser(ctx)
    const request = await ctx.db.get(args.requestId)
    if (!request || request.recipientId !== recipient._id) {
      throw new Error("Payment request not found")
    }
    if (await expireIfDue(ctx, request)) return { status: "expired" as const }
    if (request.status !== "pending") {
      throw new Error("This request can no longer be declined")
    }

    const declinedAt = Date.now()
    await ctx.db.patch(request._id, {
      status: "declined",
      isOpen: false,
      declinedAt,
    })
    await deleteNotificationsForPaymentRequest(ctx, request._id)
    await createPaymentRequestNotification(ctx, {
      recipientId: request.requesterId,
      actorId: recipient._id,
      requestId: request._id,
      type: "payment-request-declined",
      createdAt: declinedAt,
    })
    await ctx.db.insert("activityItems", {
      userId: request.requesterId,
      actorId: recipient._id,
      type: "payment-request-declined",
      source: { type: "payment-request", id: request._id },
      createdAt: declinedAt,
    })
    return { status: "declined" as const }
  },
})

export const cancel = mutation({
  args: { requestId: v.id("paymentRequests") },
  handler: async (ctx, args) => {
    const requester = await currentOnboardedUser(ctx)
    const request = await ctx.db.get(args.requestId)
    if (!request || request.requesterId !== requester._id) {
      throw new Error("Payment request not found")
    }
    if (await expireIfDue(ctx, request)) return { status: "expired" as const }
    if (request.status !== "pending") {
      throw new Error("This request can no longer be cancelled")
    }

    const cancelledAt = Date.now()
    await ctx.db.patch(request._id, {
      status: "cancelled",
      isOpen: false,
      cancelledAt,
    })
    await deleteNotificationsForPaymentRequest(ctx, request._id)
    return { status: "cancelled" as const }
  },
})

export async function reservePaymentRequestForFulfillment(
  ctx: MutationCtx,
  {
    requestId,
    paymentId,
    payerId,
    requesterId,
    amountBaseUnits,
    destinationAddress,
  }: {
    requestId: Id<"paymentRequests">
    paymentId: Id<"payments">
    payerId: Id<"users">
    requesterId: Id<"users">
    amountBaseUnits: string
    destinationAddress: string
  }
) {
  const request = await ctx.db.get(requestId)
  if (!request) throw new Error("Payment request not found")
  if (await expireIfDue(ctx, request)) {
    throw new Error("This payment request has expired")
  }
  if (request.status !== "pending") {
    throw new Error("This payment request is no longer available")
  }
  if (request.recipientId !== payerId || request.requesterId !== requesterId) {
    throw new Error("This payment does not match the request")
  }
  if (request.amountBaseUnits !== amountBaseUnits) {
    throw new Error("Pay the exact amount requested")
  }
  if (request.requesterWalletAddress !== destinationAddress) {
    throw new Error(
      "The requester changed their receiving wallet. Ask them to create a new request."
    )
  }
  if (
    !(await isFriend(ctx, requesterId, payerId)) ||
    (await isBlocked(ctx, requesterId, payerId))
  ) {
    throw new Error("This request is no longer available to pay")
  }

  await ctx.db.patch(request._id, {
    status: "payment-processing",
    fulfillmentPaymentId: paymentId,
    paymentStartedAt: Date.now(),
  })
}

export async function completePaymentRequestFulfillment(
  ctx: MutationCtx,
  {
    requestId,
    paymentId,
    completedAt,
  }: {
    requestId: Id<"paymentRequests">
    paymentId: Id<"payments">
    completedAt: number
  }
) {
  const request = await ctx.db.get(requestId)
  if (!request) return false
  if (request.status === "completed") return true
  if (
    request.status !== "payment-processing" ||
    request.fulfillmentPaymentId !== paymentId
  ) {
    return false
  }

  await ctx.db.patch(request._id, {
    status: "completed",
    isOpen: false,
    completedAt,
  })
  await deleteNotificationsForPaymentRequest(ctx, request._id)
  await createPaymentRequestNotification(ctx, {
    recipientId: request.requesterId,
    actorId: request.recipientId,
    requestId: request._id,
    type: "payment-request-completed",
    createdAt: completedAt,
  })
  await Promise.all([
    ctx.db.insert("activityItems", {
      userId: request.recipientId,
      actorId: request.requesterId,
      type: "payment-request-paid",
      source: { type: "payment-request", id: request._id },
      createdAt: completedAt,
    }),
    ctx.db.insert("activityItems", {
      userId: request.requesterId,
      actorId: request.recipientId,
      type: "payment-request-completed",
      source: { type: "payment-request", id: request._id },
      createdAt: completedAt,
    }),
  ])
  return true
}

export async function releasePaymentRequestFulfillment(
  ctx: MutationCtx,
  requestId: Id<"paymentRequests"> | undefined,
  paymentId: Id<"payments">
) {
  if (!requestId) return
  const request = await ctx.db.get(requestId)
  if (
    !request ||
    request.status !== "payment-processing" ||
    request.fulfillmentPaymentId !== paymentId
  ) {
    return
  }
  if (request.expiresAt <= Date.now()) {
    await ctx.db.patch(request._id, {
      status: "expired",
      isOpen: false,
      expiredAt: Date.now(),
    })
    await deleteNotificationsForPaymentRequest(ctx, request._id)
    return
  }
  await ctx.db.patch(request._id, {
    status: "pending",
    fulfillmentPaymentId: undefined,
    paymentStartedAt: undefined,
  })
}

export async function cancelPendingPaymentRequestsBetween(
  ctx: MutationCtx,
  firstUserId: Id<"users">,
  secondUserId: Id<"users">
) {
  const requests = await Promise.all([
    openRequestBetween(ctx, firstUserId, secondUserId),
    openRequestBetween(ctx, secondUserId, firstUserId),
  ])
  for (const request of requests) {
    if (!request || request.status !== "pending") continue
    await ctx.db.patch(request._id, {
      status: "cancelled",
      isOpen: false,
      cancelledAt: Date.now(),
    })
    await deleteNotificationsForPaymentRequest(ctx, request._id)
  }
}

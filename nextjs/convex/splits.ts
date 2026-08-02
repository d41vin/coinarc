import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import { mutation, query } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import {
  createSplitNotification,
  deleteNotificationsForSplitParticipant,
} from "./notifications"

const ARC_TESTNET_CHAIN_ID = 5_042_002
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_PARTICIPANTS = 20
const MAX_TITLE_LENGTH = 80
const MAX_DESCRIPTION_LENGTH = 280
const MAX_EMOJI_LENGTH = 16
const REMINDER_COOLDOWN_MS = DAY_MS

type CoinArcIdentity = {
  tokenIdentifier: string
  subject: string
  walletAddress?: unknown
  walletChainId?: unknown
  walletCustody?: unknown
  circleWalletId?: unknown
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

type SplitStatus = "active" | "completed" | "closed" | "cancelled" | "expired"
type ParticipantStatus =
  | "pending"
  | "payment-processing"
  | "paid-in-app"
  | "paid-outside"
  | "declined"
  | "cancelled"

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

function validBaseUnits(amountBaseUnits: string, required = true) {
  const pattern = required ? /^[1-9]\d*$/ : /^\d+$/
  if (!pattern.test(amountBaseUnits)) {
    throw new Error("Enter a valid USDC amount")
  }
  const amount = BigInt(amountBaseUnits)
  if (amount > BigInt(10) ** BigInt(24)) {
    throw new Error("Split amount is too large")
  }
  return amount
}

function validClientRequestId(clientRequestId: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      clientRequestId
    )
  ) {
    throw new Error("Could not create this split. Please try again.")
  }
}

function validExpiryDays(days: number | undefined) {
  if (days === undefined) return undefined
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error("Choose a deadline between 1 and 365 days")
  }
  return days
}

function normalizeTitle(value: string) {
  const title = value.trim()
  if (!title) throw new Error("Enter a title for this split")
  if (title.length > MAX_TITLE_LENGTH) {
    throw new Error(`Titles must be ${MAX_TITLE_LENGTH} characters or fewer`)
  }
  return title
}

function normalizeDescription(value: string | undefined) {
  const description = value?.trim()
  if (!description) return undefined
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(
      `Descriptions must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`
    )
  }
  return description
}

function normalizeEmoji(value: string | undefined) {
  const emoji = value?.trim()
  if (!emoji) return undefined
  if (emoji.length > MAX_EMOJI_LENGTH) {
    throw new Error("Choose one short emoji")
  }
  return emoji
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

function isSettled(status: ParticipantStatus) {
  return status === "paid-in-app" || status === "paid-outside"
}

function effectiveStatus(
  split: Doc<"splits">,
  participants: Doc<"splitParticipants">[],
  now = Date.now()
): SplitStatus {
  if (split.status !== "active") return split.status
  if (participants.every((participant) => isSettled(participant.status))) {
    return "completed"
  }
  if (
    split.expiresAt !== undefined &&
    split.expiresAt <= now &&
    !participants.some(
      (participant) => participant.status === "payment-processing"
    )
  ) {
    return "expired"
  }
  return "active"
}

async function participantsFor(
  ctx: MutationCtx | QueryCtx,
  splitId: Id<"splits">
) {
  return await ctx.db
    .query("splitParticipants")
    .withIndex("by_split_id", (q) => q.eq("splitId", splitId))
    .take(MAX_PARTICIPANTS)
}

async function maybeCompleteSplit(ctx: MutationCtx, split: Doc<"splits">) {
  if (split.status !== "active") return false
  const participants = await participantsFor(ctx, split._id)
  if (!participants.every((participant) => isSettled(participant.status))) {
    return false
  }
  await ctx.db.patch(split._id, {
    status: "completed",
    completedAt: Date.now(),
  })
  return true
}

async function summaryFor(
  ctx: QueryCtx,
  split: Doc<"splits">,
  viewerId: Id<"users">
) {
  const participants = await participantsFor(ctx, split._id)
  const ownParticipant = participants.find(
    (participant) => participant.participantId === viewerId
  )
  const collected = participants.reduce(
    (total, participant) =>
      isSettled(participant.status)
        ? total + BigInt(participant.amountBaseUnits)
        : total,
    BigInt(0)
  )
  const creator = await profileFor(ctx, split.creatorId)
  return {
    id: split._id,
    role:
      split.creatorId === viewerId
        ? ("collecting" as const)
        : ("contributing" as const),
    title: split.title,
    emoji: split.emoji,
    status: effectiveStatus(split, participants),
    createdAt: split.createdAt,
    expiresAt: split.expiresAt,
    collectionTargetBaseUnits: split.collectionTargetBaseUnits,
    collectedBaseUnits: collected.toString(),
    participantCount: participants.length,
    ownAmountBaseUnits: ownParticipant?.amountBaseUnits,
    ownStatus: ownParticipant?.status,
    creator,
  }
}

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    emoji: v.optional(v.string()),
    totalAmountBaseUnits: v.string(),
    includeCreatorShare: v.boolean(),
    creatorShareBaseUnits: v.optional(v.string()),
    splitMode: v.union(v.literal("equal"), v.literal("custom")),
    participantIds: v.array(v.id("users")),
    customShares: v.optional(
      v.array(
        v.object({ participantId: v.id("users"), amountBaseUnits: v.string() })
      )
    ),
    expiresInDays: v.optional(v.number()),
    clientRequestId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user: creator } = await currentOnboardedUser(ctx)
    validClientRequestId(args.clientRequestId)
    const existing = await ctx.db
      .query("splits")
      .withIndex("by_creator_id_and_client_request_id", (q) =>
        q
          .eq("creatorId", creator._id)
          .eq("clientRequestId", args.clientRequestId)
      )
      .unique()
    if (existing) return { splitId: existing._id }

    const title = normalizeTitle(args.title)
    const description = normalizeDescription(args.description)
    const emoji = normalizeEmoji(args.emoji)
    const total = validBaseUnits(args.totalAmountBaseUnits)
    const expiresInDays = validExpiryDays(args.expiresInDays)
    if (
      args.participantIds.length < 2 ||
      args.participantIds.length > MAX_PARTICIPANTS
    ) {
      throw new Error(`Choose between 2 and ${MAX_PARTICIPANTS} friends`)
    }
    if (new Set(args.participantIds).size !== args.participantIds.length) {
      throw new Error("Each friend can be added only once")
    }
    if (
      args.participantIds.some((participantId) => participantId === creator._id)
    ) {
      throw new Error("You cannot add yourself as a participant")
    }

    const collectorWallet = await primaryWalletFor(ctx, creator._id)
    if (!collectorWallet) {
      throw new Error(
        "Link an Arc Testnet receiving wallet before creating a split"
      )
    }
    for (const participantId of args.participantIds) {
      const participant = await ctx.db.get(participantId)
      if (
        !participant ||
        !participant.onboardingComplete ||
        !participant.displayName ||
        !participant.username
      ) {
        throw new Error("One of these CoinArc friends is unavailable")
      }
      if (!(await isFriend(ctx, creator._id, participantId))) {
        throw new Error("You can split bills only with current friends")
      }
      if (await isBlocked(ctx, creator._id, participantId)) {
        throw new Error("One of these friends is unavailable for splits")
      }
    }

    let creatorShare: bigint
    let participantShares: { participantId: Id<"users">; amount: bigint }[]
    if (args.splitMode === "equal") {
      const shareCount = BigInt(
        args.participantIds.length + (args.includeCreatorShare ? 1 : 0)
      )
      const baseShare = total / shareCount
      const remainder = total % shareCount
      const amounts = Array.from(
        { length: Number(shareCount) },
        (_, index) =>
          baseShare + (BigInt(index) < remainder ? BigInt(1) : BigInt(0))
      )
      creatorShare = args.includeCreatorShare ? amounts[0] : BigInt(0)
      participantShares = args.participantIds.map((participantId, index) => ({
        participantId,
        amount: amounts[index + (args.includeCreatorShare ? 1 : 0)],
      }))
    } else {
      creatorShare = validBaseUnits(args.creatorShareBaseUnits ?? "0", false)
      if (
        !args.customShares ||
        args.customShares.length !== args.participantIds.length
      ) {
        throw new Error("Set a custom share for each participant")
      }
      const customByParticipant = new Map(
        args.customShares.map((share) => [
          share.participantId,
          share.amountBaseUnits,
        ])
      )
      if (customByParticipant.size !== args.participantIds.length) {
        throw new Error("Set one custom share for each participant")
      }
      participantShares = args.participantIds.map((participantId) => {
        const amountBaseUnits = customByParticipant.get(participantId)
        if (!amountBaseUnits) {
          throw new Error("Set a custom share for each participant")
        }
        return { participantId, amount: validBaseUnits(amountBaseUnits) }
      })
      const assigned = participantShares.reduce(
        (sum, participant) => sum + participant.amount,
        creatorShare
      )
      if (assigned !== total) {
        throw new Error("Custom shares must add up to the total expense")
      }
    }

    const collectionTarget = participantShares.reduce(
      (sum, participant) => sum + participant.amount,
      BigInt(0)
    )
    if (collectionTarget <= BigInt(0)) {
      throw new Error("Participants must have a positive amount to contribute")
    }

    const createdAt = Date.now()
    const splitId = await ctx.db.insert("splits", {
      creatorId: creator._id,
      collectorWalletAddress: collectorWallet.address,
      title,
      description,
      emoji,
      totalAmountBaseUnits: total.toString(),
      creatorShareBaseUnits: creatorShare.toString(),
      collectionTargetBaseUnits: collectionTarget.toString(),
      splitMode: args.splitMode,
      clientRequestId: args.clientRequestId,
      status: "active",
      expiresAt:
        expiresInDays === undefined
          ? undefined
          : createdAt + expiresInDays * DAY_MS,
      createdAt,
    })
    for (const participant of participantShares) {
      await ctx.db.insert("splitParticipants", {
        splitId,
        participantId: participant.participantId,
        amountBaseUnits: participant.amount.toString(),
        status: "pending",
        invitedAt: createdAt,
      })
      await createSplitNotification(ctx, {
        recipientId: participant.participantId,
        actorId: creator._id,
        splitId,
        type: "split-invited",
        createdAt,
      })
      await ctx.db.insert("activityItems", {
        userId: participant.participantId,
        actorId: creator._id,
        type: "split-invited",
        source: { type: "split", id: splitId },
        createdAt,
      })
    }
    await ctx.db.insert("activityItems", {
      userId: creator._id,
      actorId: creator._id,
      type: "split-created",
      source: { type: "split", id: splitId },
      createdAt,
    })
    return { splitId }
  },
})

export const history = query({
  args: {
    role: v.union(v.literal("collecting"), v.literal("contributing")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { user: viewer } = await currentOnboardedUser(ctx)
    if (args.role === "collecting") {
      const result = await ctx.db
        .query("splits")
        .withIndex("by_creator_id_and_created_at", (q) =>
          q.eq("creatorId", viewer._id)
        )
        .order("desc")
        .paginate(args.paginationOpts)
      return {
        ...result,
        page: await Promise.all(
          result.page.map((split) => summaryFor(ctx, split, viewer._id))
        ),
      }
    }

    const result = await ctx.db
      .query("splitParticipants")
      .withIndex("by_participant_id_and_invited_at", (q) =>
        q.eq("participantId", viewer._id)
      )
      .order("desc")
      .paginate(args.paginationOpts)
    const page = await Promise.all(
      result.page.map(async (participant) => {
        const split = await ctx.db.get(participant.splitId)
        return split ? await summaryFor(ctx, split, viewer._id) : null
      })
    )
    return {
      ...result,
      page: page.filter(
        (split): split is NonNullable<typeof split> => split !== null
      ),
    }
  },
})

export const details = query({
  args: { splitId: v.id("splits") },
  handler: async (ctx, args) => {
    const { user: viewer } = await currentOnboardedUser(ctx)
    const split = await ctx.db.get(args.splitId)
    if (!split) throw new Error("Split not found")
    const participants = await participantsFor(ctx, split._id)
    const ownParticipant = participants.find(
      (participant) => participant.participantId === viewer._id
    )
    if (split.creatorId !== viewer._id && !ownParticipant) {
      throw new Error("Split not found")
    }
    const [creator, participantDetails] = await Promise.all([
      profileFor(ctx, split.creatorId),
      Promise.all(
        participants.map(async (participant) => ({
          id: participant._id,
          amountBaseUnits: participant.amountBaseUnits,
          status: participant.status,
          invitedAt: participant.invitedAt,
          paymentStartedAt: participant.paymentStartedAt,
          paidAt: participant.paidAt,
          paidOutsideAt: participant.paidOutsideAt,
          declinedAt: participant.declinedAt,
          cancelledAt: participant.cancelledAt,
          reminderSentAt: participant.reminderSentAt,
          paymentId: participant.fulfillmentPaymentId,
          profile: await profileFor(ctx, participant.participantId),
        }))
      ),
    ])
    const collected = participants.reduce(
      (total, participant) =>
        isSettled(participant.status)
          ? total + BigInt(participant.amountBaseUnits)
          : total,
      BigInt(0)
    )
    return {
      id: split._id,
      isCreator: split.creatorId === viewer._id,
      creatorId: split.creatorId,
      title: split.title,
      description: split.description,
      emoji: split.emoji,
      splitMode: split.splitMode,
      status: effectiveStatus(split, participants),
      createdAt: split.createdAt,
      expiresAt: split.expiresAt,
      completedAt: split.completedAt,
      closedAt: split.closedAt,
      cancelledAt: split.cancelledAt,
      totalAmountBaseUnits: split.totalAmountBaseUnits,
      creatorShareBaseUnits: split.creatorShareBaseUnits,
      collectionTargetBaseUnits: split.collectionTargetBaseUnits,
      collectedBaseUnits: collected.toString(),
      collectorWalletAddress: split.collectorWalletAddress,
      creator,
      ownParticipantId: ownParticipant?._id,
      participants: participantDetails,
    }
  },
})

export const decline = mutation({
  args: { splitParticipantId: v.id("splitParticipants") },
  handler: async (ctx, args) => {
    const { user: participant } = await currentOnboardedUser(ctx)
    const splitParticipant = await ctx.db.get(args.splitParticipantId)
    if (
      !splitParticipant ||
      splitParticipant.participantId !== participant._id
    ) {
      throw new Error("Split contribution not found")
    }
    const split = await ctx.db.get(splitParticipant.splitId)
    if (!split) throw new Error("Split not found")
    const participants = await participantsFor(ctx, split._id)
    if (effectiveStatus(split, participants) !== "active") {
      throw new Error("This split is no longer available")
    }
    if (splitParticipant.status !== "pending") {
      throw new Error("This contribution can no longer be declined")
    }
    const declinedAt = Date.now()
    await ctx.db.patch(splitParticipant._id, {
      status: "declined",
      declinedAt,
    })
    await deleteNotificationsForSplitParticipant(
      ctx,
      split._id,
      participant._id
    )
    await createSplitNotification(ctx, {
      recipientId: split.creatorId,
      actorId: participant._id,
      splitId: split._id,
      type: "split-participant-declined",
      createdAt: declinedAt,
    })
    await ctx.db.insert("activityItems", {
      userId: split.creatorId,
      actorId: participant._id,
      type: "split-participant-declined",
      source: { type: "split", id: split._id },
      createdAt: declinedAt,
    })
    return { status: "declined" as const }
  },
})

export const remind = mutation({
  args: { splitParticipantId: v.id("splitParticipants") },
  handler: async (ctx, args) => {
    const { user: creator } = await currentOnboardedUser(ctx)
    const participant = await ctx.db.get(args.splitParticipantId)
    if (!participant) throw new Error("Split participant not found")
    const split = await ctx.db.get(participant.splitId)
    if (!split || split.creatorId !== creator._id)
      throw new Error("Split not found")
    const participants = await participantsFor(ctx, split._id)
    if (effectiveStatus(split, participants) !== "active") {
      throw new Error("This split is no longer active")
    }
    if (participant.status !== "pending") {
      throw new Error("Only pending participants can be reminded")
    }
    const now = Date.now()
    if (
      participant.reminderSentAt !== undefined &&
      now - participant.reminderSentAt < REMINDER_COOLDOWN_MS
    ) {
      throw new Error("You can send another reminder in 24 hours")
    }
    await ctx.db.patch(participant._id, { reminderSentAt: now })
    await createSplitNotification(ctx, {
      recipientId: participant.participantId,
      actorId: creator._id,
      splitId: split._id,
      type: "split-reminder",
      createdAt: now,
    })
    return { sentAt: now }
  },
})

export const markPaidOutside = mutation({
  args: { splitParticipantId: v.id("splitParticipants") },
  handler: async (ctx, args) => {
    const { user: creator } = await currentOnboardedUser(ctx)
    const participant = await ctx.db.get(args.splitParticipantId)
    if (!participant) throw new Error("Split participant not found")
    const split = await ctx.db.get(participant.splitId)
    if (!split || split.creatorId !== creator._id)
      throw new Error("Split not found")
    if (split.status !== "active") {
      throw new Error("This split can no longer be updated")
    }
    if (participant.status !== "pending" && participant.status !== "declined") {
      throw new Error("This participant cannot be marked as paid")
    }
    const paidOutsideAt = Date.now()
    await ctx.db.patch(participant._id, {
      status: "paid-outside",
      paidOutsideAt,
    })
    await deleteNotificationsForSplitParticipant(
      ctx,
      split._id,
      participant.participantId
    )
    await createSplitNotification(ctx, {
      recipientId: participant.participantId,
      actorId: creator._id,
      splitId: split._id,
      type: "split-paid-outside",
      createdAt: paidOutsideAt,
    })
    await Promise.all([
      ctx.db.insert("activityItems", {
        userId: creator._id,
        actorId: creator._id,
        subjectId: participant.participantId,
        type: "split-paid-outside",
        source: { type: "split", id: split._id },
        createdAt: paidOutsideAt,
      }),
      ctx.db.insert("activityItems", {
        userId: participant.participantId,
        actorId: creator._id,
        type: "split-paid-outside",
        source: { type: "split", id: split._id },
        createdAt: paidOutsideAt,
      }),
    ])
    await maybeCompleteSplit(ctx, split)
    return { status: "paid-outside" as const }
  },
})

export const extendDeadline = mutation({
  args: { splitId: v.id("splits"), expiresInDays: v.number() },
  handler: async (ctx, args) => {
    const { user: creator } = await currentOnboardedUser(ctx)
    const split = await ctx.db.get(args.splitId)
    if (!split || split.creatorId !== creator._id)
      throw new Error("Split not found")
    if (split.status !== "active") {
      throw new Error("This split can no longer be extended")
    }
    const days = validExpiryDays(args.expiresInDays)
    const extendedAt = Date.now()
    const expiresAt = extendedAt + days! * DAY_MS
    await ctx.db.patch(split._id, { expiresAt })
    const participants = await participantsFor(ctx, split._id)
    for (const participant of participants) {
      if (participant.status !== "pending") continue
      await createSplitNotification(ctx, {
        recipientId: participant.participantId,
        actorId: creator._id,
        splitId: split._id,
        type: "split-deadline-extended",
        createdAt: extendedAt,
      })
    }
    return { expiresAt }
  },
})

export const close = mutation({
  args: { splitId: v.id("splits") },
  handler: async (ctx, args) => {
    const { user: creator } = await currentOnboardedUser(ctx)
    const split = await ctx.db.get(args.splitId)
    if (!split || split.creatorId !== creator._id)
      throw new Error("Split not found")
    if (split.status !== "active")
      throw new Error("This split is already closed")
    const participants = await participantsFor(ctx, split._id)
    if (
      participants.some(
        (participant) => participant.status === "payment-processing"
      )
    ) {
      throw new Error("Wait for the payment currently being confirmed")
    }
    const closedAt = Date.now()
    await ctx.db.patch(split._id, { status: "closed", closedAt })
    await ctx.db.insert("activityItems", {
      userId: creator._id,
      actorId: creator._id,
      type: "split-closed",
      source: { type: "split", id: split._id },
      createdAt: closedAt,
    })
    for (const participant of participants) {
      if (participant.status !== "pending") continue
      await deleteNotificationsForSplitParticipant(
        ctx,
        split._id,
        participant.participantId
      )
      await createSplitNotification(ctx, {
        recipientId: participant.participantId,
        actorId: creator._id,
        splitId: split._id,
        type: "split-closed",
        createdAt: closedAt,
      })
      await ctx.db.insert("activityItems", {
        userId: participant.participantId,
        actorId: creator._id,
        type: "split-closed",
        source: { type: "split", id: split._id },
        createdAt: closedAt,
      })
    }
    return { status: "closed" as const }
  },
})

export const cancel = mutation({
  args: { splitId: v.id("splits") },
  handler: async (ctx, args) => {
    const { user: creator } = await currentOnboardedUser(ctx)
    const split = await ctx.db.get(args.splitId)
    if (!split || split.creatorId !== creator._id)
      throw new Error("Split not found")
    if (split.status !== "active")
      throw new Error("This split cannot be cancelled")
    const participants = await participantsFor(ctx, split._id)
    if (participants.some((participant) => isSettled(participant.status))) {
      throw new Error("Close this split instead because it has contributions")
    }
    if (
      participants.some(
        (participant) => participant.status === "payment-processing"
      )
    ) {
      throw new Error("Wait for the payment currently being confirmed")
    }
    const cancelledAt = Date.now()
    await ctx.db.patch(split._id, { status: "cancelled", cancelledAt })
    await ctx.db.insert("activityItems", {
      userId: creator._id,
      actorId: creator._id,
      type: "split-cancelled",
      source: { type: "split", id: split._id },
      createdAt: cancelledAt,
    })
    for (const participant of participants) {
      if (participant.status !== "pending") continue
      await ctx.db.patch(participant._id, {
        status: "cancelled",
        cancelledAt,
      })
      await deleteNotificationsForSplitParticipant(
        ctx,
        split._id,
        participant.participantId
      )
      await createSplitNotification(ctx, {
        recipientId: participant.participantId,
        actorId: creator._id,
        splitId: split._id,
        type: "split-cancelled",
        createdAt: cancelledAt,
      })
      await ctx.db.insert("activityItems", {
        userId: participant.participantId,
        actorId: creator._id,
        type: "split-cancelled",
        source: { type: "split", id: split._id },
        createdAt: cancelledAt,
      })
    }
    return { status: "cancelled" as const }
  },
})

export async function reserveSplitParticipantForFulfillment(
  ctx: MutationCtx,
  {
    splitParticipantId,
    paymentId,
    payerId,
    creatorId,
    amountBaseUnits,
    destinationAddress,
  }: {
    splitParticipantId: Id<"splitParticipants">
    paymentId: Id<"payments">
    payerId: Id<"users">
    creatorId: Id<"users">
    amountBaseUnits: string
    destinationAddress: string
  }
) {
  const participant = await ctx.db.get(splitParticipantId)
  if (!participant) throw new Error("Split contribution not found")
  const split = await ctx.db.get(participant.splitId)
  if (!split) throw new Error("Split not found")
  const participants = await participantsFor(ctx, split._id)
  if (effectiveStatus(split, participants) !== "active") {
    throw new Error("This split is no longer available to pay")
  }
  if (
    participant.participantId !== payerId ||
    split.creatorId !== creatorId ||
    participant.amountBaseUnits !== amountBaseUnits ||
    split.collectorWalletAddress !== destinationAddress
  ) {
    throw new Error("This payment does not match the split contribution")
  }
  if (participant.status !== "pending") {
    throw new Error("This contribution is no longer available to pay")
  }
  if (
    !(await isFriend(ctx, creatorId, payerId)) ||
    (await isBlocked(ctx, creatorId, payerId))
  ) {
    throw new Error("This contribution is no longer available to pay")
  }
  await ctx.db.patch(participant._id, {
    status: "payment-processing",
    fulfillmentPaymentId: paymentId,
    paymentStartedAt: Date.now(),
  })
}

export async function destinationForSplitParticipant(
  ctx: MutationCtx,
  splitParticipantId: Id<"splitParticipants">
) {
  const participant = await ctx.db.get(splitParticipantId)
  if (!participant) throw new Error("Split contribution not found")
  const split = await ctx.db.get(participant.splitId)
  if (!split) throw new Error("Split not found")
  return split.collectorWalletAddress
}

export async function completeSplitParticipantFulfillment(
  ctx: MutationCtx,
  {
    splitParticipantId,
    paymentId,
    completedAt,
  }: {
    splitParticipantId: Id<"splitParticipants">
    paymentId: Id<"payments">
    completedAt: number
  }
) {
  const participant = await ctx.db.get(splitParticipantId)
  if (!participant) return false
  if (participant.status === "paid-in-app") return true
  if (
    participant.status !== "payment-processing" ||
    participant.fulfillmentPaymentId !== paymentId
  ) {
    return false
  }
  const split = await ctx.db.get(participant.splitId)
  if (!split) return false
  await ctx.db.patch(participant._id, {
    status: "paid-in-app",
    paidAt: completedAt,
  })
  await deleteNotificationsForSplitParticipant(
    ctx,
    split._id,
    participant.participantId
  )
  await createSplitNotification(ctx, {
    recipientId: split.creatorId,
    actorId: participant.participantId,
    splitId: split._id,
    type: "split-participant-paid",
    createdAt: completedAt,
  })
  await Promise.all([
    ctx.db.insert("activityItems", {
      userId: participant.participantId,
      actorId: participant.participantId,
      type: "split-contribution-paid",
      source: { type: "split", id: split._id },
      createdAt: completedAt,
    }),
    ctx.db.insert("activityItems", {
      userId: split.creatorId,
      actorId: participant.participantId,
      type: "split-contribution-paid",
      source: { type: "split", id: split._id },
      createdAt: completedAt,
    }),
  ])
  await maybeCompleteSplit(ctx, split)
  return true
}

export async function releaseSplitParticipantFulfillment(
  ctx: MutationCtx,
  splitParticipantId: Id<"splitParticipants"> | undefined,
  paymentId: Id<"payments">
) {
  if (!splitParticipantId) return
  const participant = await ctx.db.get(splitParticipantId)
  if (
    !participant ||
    participant.status !== "payment-processing" ||
    participant.fulfillmentPaymentId !== paymentId
  ) {
    return
  }
  const split = await ctx.db.get(participant.splitId)
  if (!split || split.status !== "active") return
  await ctx.db.patch(participant._id, {
    status: "pending",
    fulfillmentPaymentId: undefined,
    paymentStartedAt: undefined,
  })
}

export async function cancelPendingSplitParticipantsBetween(
  ctx: MutationCtx,
  firstUserId: Id<"users">,
  secondUserId: Id<"users">
) {
  const candidates = await Promise.all(
    [firstUserId, secondUserId].map((participantId) =>
      ctx.db
        .query("splitParticipants")
        .withIndex("by_participant_id_and_invited_at", (q) =>
          q.eq("participantId", participantId)
        )
        .take(100)
    )
  )
  for (const participant of candidates.flat()) {
    if (participant.status !== "pending") continue
    const split = await ctx.db.get(participant.splitId)
    if (
      !split ||
      split.status !== "active" ||
      !(
        (split.creatorId === firstUserId &&
          participant.participantId === secondUserId) ||
        (split.creatorId === secondUserId &&
          participant.participantId === firstUserId)
      )
    ) {
      continue
    }
    await ctx.db.patch(participant._id, {
      status: "cancelled",
      cancelledAt: Date.now(),
    })
    await deleteNotificationsForSplitParticipant(
      ctx,
      split._id,
      participant.participantId
    )
  }
}

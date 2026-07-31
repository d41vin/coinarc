import { ConvexHttpClient } from "convex/browser"
import { makeFunctionReference } from "convex/server"
import { signJwt, signPaymentReconciliationJwt, type Session } from "@/lib/auth"

function unauthenticatedClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is required")
  return new ConvexHttpClient(url)
}

export async function createCircleOtpAttempt(
  attemptId: string,
  email: string,
  deviceId: string
): Promise<{ allowed: boolean; retryAfterMs: number | null }> {
  return unauthenticatedClient().mutation(
    makeFunctionReference<"mutation">("authAttempts:createCircleOtpAttempt"),
    { attemptId, email, deviceId }
  )
}
export async function consumeCircleOtpAttempt(
  attemptId: string,
  deviceId: string
) {
  return unauthenticatedClient().mutation(
    makeFunctionReference<"mutation">("authAttempts:consumeCircleOtpAttempt"),
    { attemptId, deviceId }
  )
}
export async function createSiweNonce(
  nonce: string,
  purpose: "sign-in" | "wallet-link"
) {
  return unauthenticatedClient().mutation(
    makeFunctionReference<"mutation">("authAttempts:createSiweNonce"),
    { nonce, purpose }
  )
}
export async function consumeSiweNonce(
  nonce: string,
  purpose: "sign-in" | "wallet-link"
) {
  return unauthenticatedClient().mutation(
    makeFunctionReference<"mutation">("authAttempts:consumeSiweNonce"),
    { nonce, purpose }
  )
}

function client(
  session?: Session | null,
  options?: { paymentReconciliation?: boolean }
) {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is required")
  const convex = new ConvexHttpClient(url)
  if (session) {
    convex.setAuth(
      options?.paymentReconciliation
        ? signPaymentReconciliationJwt(session)
        : signJwt(session, "convex", 5 * 60)
    )
  }
  return convex
}

export async function resolveSession(
  session: Omit<Session, "onboardingComplete">
) {
  return client({ ...session, onboardingComplete: false }).mutation(
    makeFunctionReference<"mutation">("users:ensureForSession"),
    {}
  )
}

export async function linkExternalWalletForSession(
  session: Session,
  address: string,
  chainId: number
) {
  return client(session).mutation(
    makeFunctionReference<"mutation">("users:linkExternalWallet"),
    { address, chainId }
  )
}

export async function sessionState(session: Session) {
  return client(session).query(
    makeFunctionReference<"query">("users:current"),
    {}
  )
}

type WalletForBalance = {
  address: string
  primaryReceiving: boolean
}

const settingsForBalance = makeFunctionReference<
  "query",
  Record<string, never>,
  { wallets: WalletForBalance[] } | null
>("users:settings")

export async function primaryWalletForSession(session: Session) {
  const settings = await client(session).query(settingsForBalance, {})
  return settings?.wallets.find((wallet) => wallet.primaryReceiving) ?? null
}

type PublicProfile = {
  displayName: string
  username: string
  avatarUrl?: string
  walletAddress?: string
  isOwner: boolean
}

const publicProfile = makeFunctionReference<
  "query",
  { username: string },
  PublicProfile | null
>("users:publicProfile")

type PublicProfileSearchResult = {
  displayName: string
  username: string
  avatarUrl?: string
}

const publicProfileSearch = makeFunctionReference<
  "query",
  { query: string },
  PublicProfileSearchResult[]
>("users:searchPublicProfiles")

export async function getPublicProfile(
  username: string,
  session?: Session | null
) {
  return client(session).query(publicProfile, { username })
}

export async function searchPublicProfiles(session: Session, query: string) {
  return client(session).query(publicProfileSearch, { query })
}

export async function saveAvatarForSession(
  session: Session,
  avatarUrl: string,
  avatarKey: string
): Promise<{ previousAvatarKey?: string }> {
  return client(session).mutation(
    makeFunctionReference<"mutation">("users:setAvatar"),
    { avatarUrl, avatarKey }
  )
}

export type PaymentExecution = {
  _id: string
  senderId: string
  recipientUserId?: string
  sourceWalletAddress: string
  sourceCustody: "circle" | "external"
  circleWalletId?: string
  destinationAddress: string
  amountBaseUnits: string
  clientRequestId: string
  status:
    | "draft"
    | "awaiting-approval"
    | "submitted"
    | "confirmed"
    | "failed"
    | "cancelled"
  circleChallengeId?: string
  circleTransactionId?: string
  txHash?: string
}

const paymentExecution = makeFunctionReference<
  "query",
  { paymentId: string },
  PaymentExecution
>("payments:execution")
const attachCirclePaymentChallenge = makeFunctionReference<
  "mutation",
  { paymentId: string; challengeId: string },
  null
>("payments:attachCircleChallenge")
const recordPaymentSubmitted = makeFunctionReference<
  "mutation",
  {
    paymentId: string
    txHash: string
    circleTransactionId?: string
  },
  null
>("payments:recordSubmitted")
const confirmPayment = makeFunctionReference<
  "mutation",
  { paymentId: string; txHash: string },
  { confirmed: boolean }
>("payments:confirm")
const failPayment = makeFunctionReference<
  "mutation",
  { paymentId: string; reason: string },
  null
>("payments:fail")

export async function paymentForSession(session: Session, paymentId: string) {
  return await client(session).query(paymentExecution, { paymentId })
}

export async function attachCircleChallengeForSession(
  session: Session,
  paymentId: string,
  challengeId: string
) {
  return await client(session, { paymentReconciliation: true }).mutation(
    attachCirclePaymentChallenge,
    {
      paymentId,
      challengeId,
    }
  )
}

export async function recordPaymentSubmittedForSession(
  session: Session,
  paymentId: string,
  txHash: string,
  circleTransactionId?: string
) {
  return await client(session, { paymentReconciliation: true }).mutation(
    recordPaymentSubmitted,
    {
      paymentId,
      txHash,
      ...(circleTransactionId ? { circleTransactionId } : {}),
    }
  )
}

export async function confirmPaymentForSession(
  session: Session,
  paymentId: string,
  txHash: string
) {
  return await client(session, { paymentReconciliation: true }).mutation(
    confirmPayment,
    { paymentId, txHash }
  )
}

export async function failPaymentForSession(
  session: Session,
  paymentId: string,
  reason: string
) {
  return await client(session, { paymentReconciliation: true }).mutation(
    failPayment,
    { paymentId, reason }
  )
}

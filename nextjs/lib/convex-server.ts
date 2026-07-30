import { ConvexHttpClient } from "convex/browser"
import { makeFunctionReference } from "convex/server"
import { signJwt, type Session } from "@/lib/auth"

function unauthenticatedClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is required")
  return new ConvexHttpClient(url)
}

export async function createCircleOtpAttempt(
  attemptId: string,
  email: string,
  deviceId: string
) {
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

function client(session?: Session | null) {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is required")
  const convex = new ConvexHttpClient(url)
  if (session) convex.setAuth(signJwt(session, "convex", 5 * 60))
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
) {
  return client(session).mutation(
    makeFunctionReference<"mutation">("users:setAvatar"),
    { avatarUrl, avatarKey }
  )
}

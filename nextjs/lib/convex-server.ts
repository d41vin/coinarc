import { ConvexHttpClient } from "convex/browser"
import { makeFunctionReference } from "convex/server"
import { signJwt, type Session } from "@/lib/auth"

function unauthenticatedClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is required")
  return new ConvexHttpClient(url)
}

export async function createCircleOtpAttempt(attemptId: string, email: string, deviceId: string) { return unauthenticatedClient().mutation(makeFunctionReference<"mutation">("authAttempts:createCircleOtpAttempt"), { attemptId, email, deviceId }) }
export async function consumeCircleOtpAttempt(attemptId: string, deviceId: string) { return unauthenticatedClient().mutation(makeFunctionReference<"mutation">("authAttempts:consumeCircleOtpAttempt"), { attemptId, deviceId }) }
export async function createSiweNonce(nonce: string) { return unauthenticatedClient().mutation(makeFunctionReference<"mutation">("authAttempts:createSiweNonce"), { nonce }) }
export async function consumeSiweNonce(nonce: string) { return unauthenticatedClient().mutation(makeFunctionReference<"mutation">("authAttempts:consumeSiweNonce"), { nonce }) }

function client(session: Session) {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is required")
  const convex = new ConvexHttpClient(url)
  convex.setAuth(signJwt(session, "convex", 5 * 60))
  return convex
}

export async function resolveSession(session: Omit<Session, "onboardingComplete">) {
  return client({ ...session, onboardingComplete: false }).mutation(makeFunctionReference<"mutation">("users:ensureForSession"), {})
}

export async function sessionState(session: Session) { return client(session).query(makeFunctionReference<"query">("users:current"), {}) }

export async function saveAvatarForSession(session: Session, avatarUrl: string, avatarKey: string) {
  return client(session).mutation(makeFunctionReference<"mutation">("users:setAvatar"), { avatarUrl, avatarKey })
}

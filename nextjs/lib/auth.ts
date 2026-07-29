import { createPrivateKey, createPublicKey, randomUUID, sign, verify } from "node:crypto"
import { cookies } from "next/headers"

const SESSION_COOKIE = "coinarc_session"
const nonceCookie = "coinarc_siwe_nonce"
const circleOtpCookie = "coinarc_circle_otp"

export type Session = {
  sub: string
  provider: "circle" | "siwe"
  email?: string
  onboardingComplete: boolean
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url")
}

function issuer() {
  const value = process.env.COINARC_AUTH_ISSUER?.replace(/\/$/, "")
  if (!value || !URL.canParse(value)) throw new Error("COINARC_AUTH_ISSUER must be an absolute URL")
  return value
}

function privateKey() {
  const value = process.env.COINARC_SESSION_PRIVATE_KEY?.replace(/\\n/g, "\n")
  if (!value) throw new Error("COINARC_SESSION_PRIVATE_KEY is required")
  return createPrivateKey(value)
}

export function signJwt(session: Session, audience: "coinarc-web" | "convex" | "siwe-nonce" | "circle-otp", lifetimeSeconds: number) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "coinarc-session-v1" }))
  const payload = base64url(JSON.stringify({ iss: issuer(), aud: audience, sub: session.sub, iat: now, exp: now + lifetimeSeconds, jti: randomUUID(), provider: session.provider, email: session.email, onboardingComplete: session.onboardingComplete }))
  const input = `${header}.${payload}`
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey()).toString("base64url")}`
}

function parseJwt(token: string) {
  const [encodedHeader, encodedPayload, encodedSignature, ...rest] = token.split(".")
  if (!encodedHeader || !encodedPayload || !encodedSignature || rest.length) return null
  try {
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as { alg?: string }
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Record<string, unknown>
    if (header.alg !== "RS256" || !verify("RSA-SHA256", Buffer.from(`${encodedHeader}.${encodedPayload}`), privateKey(), Buffer.from(encodedSignature, "base64url"))) return null
    return payload
  } catch { return null }
}

export function verifyJwt(token: string, audience: "coinarc-web" | "convex" | "siwe-nonce" | "circle-otp"): Session | null {
  const payload = parseJwt(token)
  if (!payload || payload.iss !== issuer() || payload.aud !== audience || typeof payload.sub !== "string" || typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000) || (payload.provider !== "circle" && payload.provider !== "siwe") || typeof payload.onboardingComplete !== "boolean") return null
  return { sub: payload.sub, provider: payload.provider, onboardingComplete: payload.onboardingComplete, ...(typeof payload.email === "string" ? { email: payload.email } : {}) }
}

export async function getSession() {
  const value = (await cookies()).get(SESSION_COOKIE)?.value
  return value ? verifyJwt(value, "coinarc-web") : null
}

export function sessionCookie(session: Session) {
  return { name: SESSION_COOKIE, value: signJwt(session, "coinarc-web", 60 * 60 * 24 * 7), options: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 7 } }
}

export function nonceCookieValue(nonce: string) {
  return { name: nonceCookie, value: nonce, options: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/api/auth/siwe", maxAge: 10 * 60 } }
}

export async function getSiweNonceCookie() {
  const value = (await cookies()).get(nonceCookie)?.value
  return value ?? null
}

export function clearNonceCookie() { return { name: nonceCookie, value: "", options: { httpOnly: true, path: "/api/auth/siwe", maxAge: 0 } } }

export function circleOtpCookieValue(attemptId: string) {
  return { name: circleOtpCookie, value: attemptId, options: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/api/auth/circle", maxAge: 10 * 60 } }
}

export async function getCircleOtpAttemptId() {
  const value = (await cookies()).get(circleOtpCookie)?.value
  return value ?? null
}

export function clearCircleOtpCookie() { return { name: circleOtpCookie, value: "", options: { httpOnly: true, path: "/api/auth/circle", maxAge: 0 } } }

export function publicJwk() {
  const jwk = createPublicKey(privateKey()).export({ format: "jwk" })
  return { ...jwk, use: "sig", alg: "RS256", kid: "coinarc-session-v1" }
}

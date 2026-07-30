import { NextResponse } from "next/server"
import { nonceCookieValue } from "@/lib/auth"
import { createSiweNonce } from "@/lib/convex-server"
import { randomBytes } from "node:crypto"
export async function GET() {
  const nonce = randomBytes(32).toString("hex")
  await createSiweNonce(nonce, "sign-in")
  const response = NextResponse.json({
    nonce,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  })
  response.cookies.set(nonceCookieValue(nonce))
  return response
}

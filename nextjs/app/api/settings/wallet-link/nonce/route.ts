import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"

import { getSession, walletLinkNonceCookieValue } from "@/lib/auth"
import { createSiweNonce } from "@/lib/convex-server"

export async function GET() {
  const session = await getSession()
  if (!session)
    return NextResponse.json(
      { error: "Sign in to link a wallet" },
      { status: 401 }
    )

  const nonce = randomBytes(32).toString("hex")
  await createSiweNonce(nonce, "wallet-link")

  const response = NextResponse.json({
    nonce,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  })
  response.cookies.set(walletLinkNonceCookieValue(nonce))
  return response
}

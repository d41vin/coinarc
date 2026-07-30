import { NextResponse } from "next/server"
import { createPublicClient, http } from "viem"
import { parseSiweMessage, verifySiweMessage } from "viem/siwe"

import {
  clearWalletLinkNonceCookie,
  getSession,
  getWalletLinkNonceCookie,
} from "@/lib/auth"
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_RPC } from "@/lib/arc-testnet"
import {
  consumeSiweNonce,
  linkExternalWalletForSession,
} from "@/lib/convex-server"

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  const response = (status: number, payload: object) => {
    const result = NextResponse.json(payload, { status })
    result.cookies.set(clearWalletLinkNonceCookie())
    return result
  }

  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { message?: unknown }).message !== "string" ||
    typeof (body as { signature?: unknown }).signature !== "string"
  )
    return response(400, { error: "Invalid wallet signature" })

  const session = await getSession()
  if (!session) return response(401, { error: "Sign in to link a wallet" })

  try {
    const { message, signature } = body as {
      message: string
      signature: `0x${string}`
    }
    const parsed = parseSiweMessage(message)
    const requestOrigin = new URL(request.url).origin
    const requestDomain = new URL(requestOrigin).host

    if (
      !parsed.address ||
      !parsed.nonce ||
      parsed.domain !== requestDomain ||
      parsed.uri !== `${requestOrigin}/settings` ||
      parsed.chainId !== ARC_TESTNET_CHAIN_ID ||
      !parsed.expirationTime ||
      new Date(parsed.expirationTime) <= new Date() ||
      parsed.nonce !== (await getWalletLinkNonceCookie())
    )
      return response(401, {
        error: "This wallet-link request is invalid or expired",
      })

    const valid = await verifySiweMessage(
      createPublicClient({ transport: http(ARC_TESTNET_RPC) }),
      {
        message,
        signature,
        address: parsed.address,
        domain: requestDomain,
        nonce: parsed.nonce,
        time: new Date(),
      }
    )
    if (!valid)
      return response(401, { error: "Wallet signature could not be verified" })

    await consumeSiweNonce(parsed.nonce, "wallet-link")
    await linkExternalWalletForSession(
      session,
      parsed.address.toLowerCase(),
      ARC_TESTNET_CHAIN_ID
    )
    return response(200, { address: parsed.address.toLowerCase() })
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : ""
    if (/already linked to another CoinArc account/i.test(message))
      return response(409, {
        error: "This wallet is already linked to another CoinArc account",
      })
    if (/link up to 20 wallets/i.test(message))
      return response(400, {
        error: "You can link up to 20 wallets to one CoinArc account",
      })
    return response(401, { error: "Could not link this wallet" })
  }
}

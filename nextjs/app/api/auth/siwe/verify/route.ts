import { NextResponse } from "next/server"
import { createPublicClient, http } from "viem"
import { parseSiweMessage, verifySiweMessage } from "viem/siwe"
import {
  clearNonceCookie,
  getSiweNonceCookie,
  sessionCookie,
  type Session,
} from "@/lib/auth"
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_RPC } from "@/lib/arc-testnet"
import { consumeSiweNonce, resolveSession } from "@/lib/convex-server"

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  const response = (status: number, payload: object) => {
    const r = NextResponse.json(payload, { status })
    r.cookies.set(clearNonceCookie())
    return r
  }
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { message?: unknown }).message !== "string" ||
    typeof (body as { signature?: unknown }).signature !== "string"
  )
    return response(400, { error: "Invalid wallet signature" })
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
      parsed.uri !== `${requestOrigin}/sign-in` ||
      parsed.chainId !== ARC_TESTNET_CHAIN_ID ||
      !parsed.expirationTime ||
      new Date(parsed.expirationTime) <= new Date() ||
      parsed.nonce !== (await getSiweNonceCookie())
    )
      return response(401, {
        error: "This sign-in request is invalid or expired",
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
    await consumeSiweNonce(parsed.nonce)
    const base: Omit<Session, "onboardingComplete"> = {
      sub: `siwe:${parsed.address.toLowerCase()}`,
      provider: "siwe",
      wallet: {
        address: parsed.address.toLowerCase(),
        chainId: ARC_TESTNET_CHAIN_ID,
        custody: "external",
      },
    }
    const state = await resolveSession(base)
    const result = NextResponse.json({
      destination: state.onboardingComplete ? "/home" : "/onboarding",
    })
    result.cookies.set(clearNonceCookie())
    result.cookies.set(
      sessionCookie({ ...base, onboardingComplete: state.onboardingComplete })
    )
    return result
  } catch {
    return response(401, { error: "Wallet signature could not be verified" })
  }
}

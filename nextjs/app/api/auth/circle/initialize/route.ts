import { NextResponse } from "next/server"
import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets"
import { findCircleArcTestnetWallet } from "@/lib/circle-wallet"

function challengeIdFrom(response: unknown) {
  if (
    response &&
    typeof response === "object" &&
    "challengeId" in response &&
    typeof response.challengeId === "string"
  ) {
    return response.challengeId
  }

  if (
    response &&
    typeof response === "object" &&
    "data" in response &&
    response.data &&
    typeof response.data === "object" &&
    "challengeId" in response.data &&
    typeof response.data.challengeId === "string"
  ) {
    return response.data.challengeId
  }

  return null
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { userToken?: unknown }).userToken !== "string"
  ) {
    return NextResponse.json(
      { error: "Invalid Circle session" },
      { status: 400 }
    )
  }

  const apiKey = process.env.CIRCLE_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "Circle is not configured" },
      { status: 500 }
    )
  }

  const { userToken } = body as { userToken: string }
  const circle = initiateUserControlledWalletsClient({ apiKey })

  try {
    const initialization = await fetch(
      "https://api.circle.com/v1/w3s/user/initialize",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "X-User-Token": userToken,
        },
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          accountType: "SCA",
          blockchains: ["ARC-TESTNET"],
        }),
      }
    )
    const initializationData: unknown = await initialization.json()
    if (initialization.ok) {
      const challengeId = challengeIdFrom(initializationData)
      if (challengeId) {
        return NextResponse.json({ challengeId })
      }
    }

    const code =
      typeof initializationData === "object" &&
      initializationData &&
      "code" in initializationData
        ? (initializationData as { code?: unknown }).code
        : undefined

    if (!initialization.ok && code !== 155106) {
      return NextResponse.json(
        { error: "Could not initialize your CoinArc wallet" },
        { status: initialization.status }
      )
    }

    // A returning user already has the one CoinArc embedded wallet we need.
    // Never request another wallet-creation challenge in that case.
    if (await findCircleArcTestnetWallet(apiKey, userToken)) {
      return NextResponse.json({ walletReady: true })
    }

    const user = await circle.getUserStatus({ userToken })
    const userId = user.data?.id
    if (!userId) {
      return NextResponse.json(
        { error: "Invalid Circle session" },
        { status: 401 }
      )
    }

    // Circle can report an authenticated user as already initialized even when
    // that user has no wallet on CoinArc's selected chain. Create the missing
    // Arc Testnet wallet through the required user-approved challenge. The
    // Circle user ID is a UUID, so it also gives this operation a stable
    // idempotency key across retries.
    const walletCreation = await circle.createWallet({
      userToken,
      idempotencyKey: userId,
      accountType: "SCA",
      blockchains: ["ARC-TESTNET"],
      metadata: [{ name: "CoinArc" }],
    })
    const challengeId = walletCreation.data?.challengeId
    if (!challengeId) {
      throw new Error("Circle did not return a wallet-creation challenge")
    }

    return NextResponse.json({ challengeId })
  } catch (reason) {
    console.error("Circle wallet initialization failed", reason)
    return NextResponse.json(
      { error: "Could not initialize your CoinArc wallet" },
      { status: 502 }
    )
  }
}

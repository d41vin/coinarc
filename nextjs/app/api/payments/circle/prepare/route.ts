import { NextResponse } from "next/server"
import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets"
import { formatUnits } from "viem"

import {
  ARC_TESTNET_USDC_ADDRESS,
  ARC_TESTNET_USDC_DECIMALS,
} from "@/lib/arc-testnet"
import { getSession } from "@/lib/auth"
import {
  attachCircleChallengeForSession,
  paymentForSession,
} from "@/lib/convex-server"

export async function POST(request: Request) {
  const session = await getSession()
  if (
    !session?.onboardingComplete ||
    session.wallet?.custody !== "circle" ||
    !session.wallet.circleWalletId
  ) {
    return NextResponse.json(
      { error: "Circle wallet authorization is required" },
      { status: 401 }
    )
  }

  const body: unknown = await request.json().catch(() => null)
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { paymentId?: unknown }).paymentId !== "string" ||
    typeof (body as { userToken?: unknown }).userToken !== "string"
  ) {
    return NextResponse.json(
      { error: "Invalid payment request" },
      { status: 400 }
    )
  }
  const { paymentId, userToken } = body as {
    paymentId: string
    userToken: string
  }
  const apiKey = process.env.CIRCLE_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "Circle is not configured" },
      { status: 500 }
    )
  }

  try {
    const payment = await paymentForSession(session, paymentId)
    if (
      payment.sourceCustody !== "circle" ||
      payment.circleWalletId !== session.wallet.circleWalletId
    ) {
      return NextResponse.json(
        { error: "Payment wallet does not match" },
        { status: 403 }
      )
    }
    if (payment.status === "confirmed") {
      return NextResponse.json(
        { error: "Payment is already confirmed" },
        { status: 409 }
      )
    }
    if (payment.status === "failed" || payment.status === "cancelled") {
      return NextResponse.json(
        { error: "Payment can no longer be approved" },
        { status: 409 }
      )
    }

    const response = await initiateUserControlledWalletsClient({
      apiKey,
    }).createTransaction({
      userToken,
      idempotencyKey: payment.clientRequestId,
      walletId: session.wallet.circleWalletId,
      destinationAddress: payment.destinationAddress,
      amounts: [
        formatUnits(BigInt(payment.amountBaseUnits), ARC_TESTNET_USDC_DECIMALS),
      ],
      tokenAddress: ARC_TESTNET_USDC_ADDRESS,
      blockchain: "ARC-TESTNET",
      refId: payment._id,
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    })
    const challengeId = response.data?.challengeId
    if (!challengeId)
      throw new Error("Circle did not return a payment challenge")
    await attachCircleChallengeForSession(session, paymentId, challengeId)
    return NextResponse.json({ challengeId })
  } catch (reason) {
    console.error("Circle payment preparation failed", reason)
    return NextResponse.json(
      { error: "Could not prepare this payment" },
      { status: 502 }
    )
  }
}

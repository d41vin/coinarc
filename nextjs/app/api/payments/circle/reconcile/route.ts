import { NextResponse } from "next/server"
import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets"

import { getSession } from "@/lib/auth"
import { failPaymentForSession, paymentForSession } from "@/lib/convex-server"
import { reconcilePaymentForSession } from "@/lib/payment-reconciliation"

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
      { error: "Invalid payment status request" },
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
    if (payment.status === "confirmed") {
      return NextResponse.json({ status: "confirmed" })
    }
    const transactions = await initiateUserControlledWalletsClient({
      apiKey,
    }).listTransactions({
      userToken,
      blockchain: "ARC-TESTNET",
      walletIds: [session.wallet.circleWalletId],
      pageSize: 20,
      order: "DESC",
    })
    const transaction = (transactions.data?.transactions ?? []).find(
      (candidate) => candidate.refId === payment._id
    )
    if (!transaction) return NextResponse.json({ status: "awaiting-approval" })
    if (transaction.state === "FAILED") {
      await failPaymentForSession(
        session,
        paymentId,
        transaction.errorReason || "Circle could not submit this payment."
      )
      return NextResponse.json({ status: "failed" })
    }
    if (!transaction.txHash) return NextResponse.json({ status: "submitted" })
    return NextResponse.json(
      await reconcilePaymentForSession(
        session,
        paymentId,
        transaction.txHash,
        transaction.id
      )
    )
  } catch (reason) {
    console.error("Circle payment reconciliation failed", reason)
    return NextResponse.json(
      { error: "Could not refresh this payment" },
      { status: 502 }
    )
  }
}

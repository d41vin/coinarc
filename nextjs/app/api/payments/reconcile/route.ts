import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { reconcilePaymentForSession } from "@/lib/payment-reconciliation"

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.onboardingComplete) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const body: unknown = await request.json().catch(() => null)
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { paymentId?: unknown }).paymentId !== "string" ||
    typeof (body as { txHash?: unknown }).txHash !== "string"
  ) {
    return NextResponse.json(
      { error: "Invalid payment status request" },
      { status: 400 }
    )
  }

  const { paymentId, txHash } = body as { paymentId: string; txHash: string }
  try {
    return NextResponse.json(
      await reconcilePaymentForSession(session, paymentId, txHash)
    )
  } catch (reason) {
    console.error("Payment reconciliation failed", reason)
    return NextResponse.json(
      { error: "Could not confirm this payment yet" },
      { status: 502 }
    )
  }
}

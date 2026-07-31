import { createPublicClient, decodeEventLog, http, type Hash } from "viem"

import {
  ARC_TESTNET_RPC,
  ARC_TESTNET_USDC_ADDRESS,
  arcUsdcAbi,
} from "@/lib/arc-testnet"
import type { Session } from "@/lib/auth"
import {
  confirmPaymentForSession,
  failPaymentForSession,
  paymentForSession,
  recordPaymentSubmittedForSession,
} from "@/lib/convex-server"

function validHash(txHash: string): txHash is Hash {
  return /^0x[a-fA-F0-9]{64}$/.test(txHash)
}

function receiptNotAvailable(reason: unknown) {
  const message = reason instanceof Error ? reason.message : ""
  return /not found|could not be found|not yet mined|unknown transaction/i.test(
    message
  )
}

function matchesExpectedTransfer(
  receipt: Awaited<
    ReturnType<ReturnType<typeof createPublicClient>["getTransactionReceipt"]>
  >,
  expected: {
    sourceWalletAddress: string
    destinationAddress: string
    amountBaseUnits: string
  }
) {
  return receipt.logs.some((log) => {
    if (log.address.toLowerCase() !== ARC_TESTNET_USDC_ADDRESS.toLowerCase()) {
      return false
    }
    try {
      const decoded = decodeEventLog({
        abi: arcUsdcAbi,
        eventName: "Transfer",
        data: log.data,
        topics: log.topics,
      })
      return (
        decoded.args.from?.toLowerCase() ===
          expected.sourceWalletAddress.toLowerCase() &&
        decoded.args.to?.toLowerCase() ===
          expected.destinationAddress.toLowerCase() &&
        decoded.args.value === BigInt(expected.amountBaseUnits)
      )
    } catch {
      return false
    }
  })
}

export async function reconcilePaymentForSession(
  session: Session,
  paymentId: string,
  txHash: string,
  circleTransactionId?: string
) {
  if (!validHash(txHash)) throw new Error("Invalid transaction hash")
  const payment = await paymentForSession(session, paymentId)
  if (payment.status === "confirmed") return { status: "confirmed" as const }
  if (payment.status === "failed" || payment.status === "cancelled") {
    return { status: payment.status }
  }

  await recordPaymentSubmittedForSession(
    session,
    paymentId,
    txHash,
    circleTransactionId
  )

  const publicClient = createPublicClient({
    transport: http(ARC_TESTNET_RPC),
  })
  let receipt: Awaited<ReturnType<typeof publicClient.getTransactionReceipt>>
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHash })
  } catch (reason) {
    if (receiptNotAvailable(reason)) return { status: "submitted" as const }
    throw reason
  }

  if (receipt.status !== "success") {
    await failPaymentForSession(
      session,
      paymentId,
      "The Arc transaction reverted before it could be confirmed."
    )
    return { status: "failed" as const }
  }

  if (!matchesExpectedTransfer(receipt, payment)) {
    await failPaymentForSession(
      session,
      paymentId,
      "The confirmed transaction did not match this CoinArc payment."
    )
    return { status: "failed" as const }
  }

  await confirmPaymentForSession(session, paymentId, txHash)
  return { status: "confirmed" as const }
}

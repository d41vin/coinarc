"use client"

import {
  ArrowDownLeft,
  ArrowUpRight,
  ReceiptText,
  Send,
  WalletCards,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { formatUnits } from "viem"
import { useConvexAuth, useQuery } from "convex/react"
import { makeFunctionReference } from "convex/server"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { ARC_TESTNET_USDC_DECIMALS } from "@/lib/arc-testnet"

type Counterparty = {
  displayName: string
  username: string
  avatarUrl?: string
}

type PaymentActivityItem = {
  id: string
  sourceType: "payment"
  type: "payment-sent" | "payment-received"
  paymentId: string
  createdAt: number
  amountBaseUnits: string
  destinationAddress: string
  counterparty: Counterparty | null
}

type RequestActivityItem = {
  id: string
  sourceType: "payment-request"
  type:
    | "payment-request-sent"
    | "payment-request-received"
    | "payment-request-declined"
    | "payment-request-paid"
    | "payment-request-completed"
  requestId: string
  createdAt: number
  amountBaseUnits: string
  counterparty: Counterparty | null
}

type ActivityItem = PaymentActivityItem | RequestActivityItem

const listActivity = makeFunctionReference<
  "query",
  Record<string, never>,
  ActivityItem[]
>("activity:list")

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function requestLabel(item: RequestActivityItem, name: string) {
  switch (item.type) {
    case "payment-request-sent":
      return `You requested payment from ${name}`
    case "payment-request-received":
      return `${name} requested payment from you`
    case "payment-request-declined":
      return `${name} declined your request`
    case "payment-request-paid":
      return `You paid ${name}'s request`
    case "payment-request-completed":
      return `${name} paid your request`
  }
}

export function ActivityFeed({
  onOpenPayment,
  onOpenRequest,
}: {
  onOpenPayment: (paymentId: string) => void
  onOpenRequest: (requestId: string) => void
}) {
  const { isAuthenticated } = useConvexAuth()
  const activity = useQuery(listActivity, isAuthenticated ? {} : "skip")

  if (activity === undefined) {
    return (
      <p className="py-8 text-sm text-muted-foreground">Loading activity…</p>
    )
  }

  if (activity.length === 0) {
    return (
      <Empty className="min-h-60 border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <WalletCards />
          </EmptyMedia>
          <EmptyTitle>No activity yet</EmptyTitle>
          <EmptyDescription>
            Payments and payment requests through CoinArc will appear here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="divide-y rounded-3xl border">
      {activity.map((item) => {
        const amount = formatUnits(
          BigInt(item.amountBaseUnits),
          ARC_TESTNET_USDC_DECIMALS
        )
        const isPayment = item.sourceType === "payment"
        const isSent = isPayment && item.type === "payment-sent"
        const name =
          item.counterparty?.displayName ??
          (isPayment ? shortAddress(item.destinationAddress) : "a friend")
        const label = isPayment
          ? isSent
            ? `You paid ${name}`
            : `${name} paid you`
          : requestLabel(item, name)
        const isIncomingRequest =
          !isPayment && item.type === "payment-request-received"
        const isRequestPaid =
          !isPayment &&
          (item.type === "payment-request-paid" ||
            item.type === "payment-request-completed")

        return (
          <Button
            className="h-auto w-full justify-start rounded-none px-4 py-3 text-left hover:bg-muted"
            key={item.id}
            onClick={() =>
              isPayment
                ? onOpenPayment(item.paymentId)
                : onOpenRequest(item.requestId)
            }
            type="button"
            variant="ghost"
          >
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                isPayment
                  ? isSent
                    ? "bg-muted"
                    : "bg-primary text-primary-foreground"
                  : isIncomingRequest
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
              }`}
            >
              {isPayment ? (
                isSent ? (
                  <ArrowUpRight className="size-5" />
                ) : (
                  <ArrowDownLeft className="size-5" />
                )
              ) : isRequestPaid ? (
                <Send className="size-4" />
              ) : (
                <ReceiptText className="size-5" />
              )}
            </span>
            <span className="ml-3 min-w-0 flex-1">
              <span className="block truncate font-medium">{label}</span>
              <span className="block text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(item.createdAt), {
                  addSuffix: true,
                })}
              </span>
            </span>
            <span className="ml-3 font-medium tabular-nums">
              {isPayment ? (isSent ? "−" : "+") : ""}
              {amount}
            </span>
          </Button>
        )
      })}
    </div>
  )
}

"use client"

import { ArrowDownLeft, ArrowUpRight, WalletCards } from "lucide-react"
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

type ActivityItem = {
  id: string
  type: "payment-sent" | "payment-received"
  paymentId: string
  createdAt: number
  amountBaseUnits: string
  destinationAddress: string
  counterparty: {
    displayName: string
    username: string
    avatarUrl?: string
  } | null
}

const listActivity = makeFunctionReference<
  "query",
  Record<string, never>,
  ActivityItem[]
>("activity:list")

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function ActivityFeed({
  onOpenPayment,
}: {
  onOpenPayment: (paymentId: string) => void
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
          <EmptyTitle>No payment activity yet</EmptyTitle>
          <EmptyDescription>
            Payments you send or receive through CoinArc will appear here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="divide-y rounded-3xl border">
      {activity.map((item) => {
        const isSent = item.type === "payment-sent"
        const amount = formatUnits(
          BigInt(item.amountBaseUnits),
          ARC_TESTNET_USDC_DECIMALS
        )
        const name =
          item.counterparty?.displayName ??
          shortAddress(item.destinationAddress)
        return (
          <Button
            className="h-auto w-full justify-start rounded-none px-4 py-3 text-left hover:bg-muted"
            key={item.id}
            onClick={() => onOpenPayment(item.paymentId)}
            type="button"
            variant="ghost"
          >
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                isSent ? "bg-muted" : "bg-primary text-primary-foreground"
              }`}
            >
              {isSent ? (
                <ArrowUpRight className="size-5" />
              ) : (
                <ArrowDownLeft className="size-5" />
              )}
            </span>
            <span className="ml-3 min-w-0 flex-1">
              <span className="block truncate font-medium">
                {isSent ? `You paid ${name}` : `${name} paid you`}
              </span>
              <span className="block text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(item.createdAt), {
                  addSuffix: true,
                })}
              </span>
            </span>
            <span className="ml-3 font-medium tabular-nums">
              {isSent ? "−" : "+"}
              {amount}
            </span>
          </Button>
        )
      })}
    </div>
  )
}

"use client"

import {
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Send,
  WalletCards,
} from "lucide-react"
import { format } from "date-fns"
import { formatUnits } from "viem"
import { useState } from "react"
import { useConvexAuth, useQuery } from "convex/react"
import { makeFunctionReference } from "convex/server"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import {
  ARC_TESTNET_EXPLORER,
  ARC_TESTNET_USDC_DECIMALS,
} from "@/lib/arc-testnet"
import { readCircleAuthorization } from "@/lib/circle-authorization"

type PaymentDetails = {
  id: string
  direction: "sent" | "received"
  amountBaseUnits: string
  status: string
  createdAt: number
  submittedAt?: number
  confirmedAt?: number
  failureReason?: string
  destinationAddress: string
  sourceWalletAddress: string
  sourceCustody: "circle" | "external"
  txHash?: string
  counterparty: {
    displayName: string
    username: string
    avatarUrl?: string
  } | null
  note?: string
}

const details = makeFunctionReference<
  "query",
  { paymentId: string },
  PaymentDetails
>("payments:details")

function initials(displayName: string) {
  return displayName
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function statusLabel(status: string) {
  switch (status) {
    case "confirmed":
      return "Confirmed"
    case "failed":
      return "Failed"
    case "cancelled":
      return "Cancelled"
    case "submitted":
      return "Confirming"
    case "awaiting-approval":
      return "Awaiting approval"
    default:
      return "Preparing"
  }
}

export function PaymentDetailDialog({
  paymentId,
  onOpenChange,
}: {
  paymentId: string | null
  onOpenChange: (open: boolean) => void
}) {
  const { isAuthenticated } = useConvexAuth()
  const payment = useQuery(
    details,
    paymentId && isAuthenticated ? { paymentId } : "skip"
  )
  const amount = payment
    ? formatUnits(BigInt(payment.amountBaseUnits), ARC_TESTNET_USDC_DECIMALS)
    : null
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string>()

  async function refreshPaymentStatus() {
    if (!payment?.txHash || payment.status !== "submitted" || refreshing) return
    setRefreshing(true)
    setRefreshError(undefined)
    try {
      const response =
        payment.sourceCustody === "circle"
          ? await (() => {
              const authorization = readCircleAuthorization()
              if (!authorization) {
                throw new Error(
                  "Your secure Circle session has ended. Please sign in again."
                )
              }
              return fetch("/api/payments/circle/reconcile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  paymentId: payment.id,
                  userToken: authorization.userToken,
                }),
              })
            })()
          : await fetch("/api/payments/reconcile", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                paymentId: payment.id,
                txHash: payment.txHash,
              }),
            })
      const data = (await response.json().catch(() => ({}))) as {
        error?: string
        status?: string
      }
      if (!response.ok) {
        throw new Error(data.error || "Could not refresh this payment")
      }
      if (data.status === "confirmed") {
        window.dispatchEvent(new Event("coinarc:payment-confirmed"))
      }
    } catch (reason) {
      setRefreshError(
        reason instanceof Error
          ? reason.message
          : "Could not refresh this payment"
      )
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={paymentId !== null}>
      <DialogContent>
        {payment === undefined ? (
          <p className="py-6 text-sm text-muted-foreground">
            Loading payment details…
          </p>
        ) : payment ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {payment.direction === "sent"
                  ? "Payment sent"
                  : "Payment received"}
              </DialogTitle>
              <DialogDescription>
                {payment.confirmedAt
                  ? `Confirmed ${format(new Date(payment.confirmedAt), "MMM d, yyyy, h:mm a")}`
                  : `Created ${format(new Date(payment.createdAt), "MMM d, yyyy, h:mm a")}`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="rounded-3xl bg-muted p-5 text-center">
                <p className="text-3xl font-semibold tracking-tight">
                  {amount} USDC
                </p>
                <Badge
                  className="mt-3"
                  variant={
                    payment.status === "failed" ? "destructive" : "secondary"
                  }
                >
                  {statusLabel(payment.status)}
                </Badge>
              </div>

              <div className="flex items-center gap-3">
                <Avatar>
                  {payment.counterparty?.avatarUrl ? (
                    <AvatarImage alt="" src={payment.counterparty.avatarUrl} />
                  ) : null}
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {payment.counterparty ? (
                      initials(payment.counterparty.displayName)
                    ) : (
                      <WalletCards />
                    )}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-muted-foreground">
                    {payment.direction === "sent" ? "Paid to" : "Paid by"}
                  </span>
                  <span className="block truncate font-medium">
                    {payment.counterparty?.displayName ??
                      shortAddress(
                        payment.direction === "sent"
                          ? payment.destinationAddress
                          : payment.sourceWalletAddress
                      )}
                  </span>
                  {payment.counterparty ? (
                    <span className="block truncate text-sm text-muted-foreground">
                      @{payment.counterparty.username}
                    </span>
                  ) : null}
                </span>
              </div>

              <Separator />

              <dl className="space-y-3 text-sm">
                <div className="flex items-start justify-between gap-5">
                  <dt className="text-muted-foreground">Network</dt>
                  <dd className="text-right font-medium">Arc Testnet</dd>
                </div>
                <div className="flex items-start justify-between gap-5">
                  <dt className="text-muted-foreground">
                    {payment.direction === "sent" ? "To" : "From"}
                  </dt>
                  <dd className="max-w-56 text-right font-mono text-xs break-all">
                    {payment.direction === "sent"
                      ? payment.destinationAddress
                      : payment.sourceWalletAddress}
                  </dd>
                </div>
              </dl>

              {payment.note ? (
                <div className="rounded-2xl border bg-muted/40 p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    Private note in CoinArc
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-wrap">
                    {payment.note}
                  </p>
                </div>
              ) : null}

              {payment.failureReason ? (
                <p className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
                  {payment.failureReason}
                </p>
              ) : null}
              {refreshError ? (
                <p className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
                  {refreshError}
                </p>
              ) : null}
            </div>

            <DialogFooter>
              {payment.status === "submitted" && payment.txHash ? (
                <Button
                  disabled={refreshing}
                  onClick={() => void refreshPaymentStatus()}
                  type="button"
                  variant="outline"
                >
                  {refreshing ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <RefreshCw />
                  )}
                  Refresh status
                </Button>
              ) : null}
              {payment.txHash ? (
                <Button
                  render={
                    <a
                      href={`${ARC_TESTNET_EXPLORER}/tx/${payment.txHash}`}
                      rel="noreferrer"
                      target="_blank"
                    />
                  }
                  type="button"
                  variant="outline"
                >
                  <ExternalLink />
                  View transaction
                </Button>
              ) : null}
              <Button onClick={() => onOpenChange(false)} type="button">
                <Send />
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Payment unavailable</DialogTitle>
              <DialogDescription>
                This payment may no longer be available to your CoinArc account.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter showCloseButton />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

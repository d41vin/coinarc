"use client"

import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk"
import {
  ArrowLeft,
  ChevronRight,
  Clock3,
  LoaderCircle,
  Send,
  UserRound,
  WalletCards,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import {
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react"
import { makeFunctionReference, type PaginationOptions } from "convex/server"
import { formatDistanceToNow } from "date-fns"
import { formatUnits, parseUnits, type Address, type Hash } from "viem"
import { useAccount, useChainId, useWriteContract } from "wagmi"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  RecipientPicker,
  type CoinArcRecipient,
  type PaymentRecipient,
} from "@/components/recipient-picker"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_USDC_ADDRESS,
  ARC_TESTNET_USDC_DECIMALS,
  arcUsdcAbi,
} from "@/lib/arc-testnet"
import { readCircleAuthorization } from "@/lib/circle-authorization"
import type { SplitFulfillment } from "@/components/splits/split-drawer"

type DraftPayment = {
  paymentId: string
  sourceWalletAddress: string
  sourceCustody: "circle" | "external"
  destinationAddress: string
  recipientUserId?: string
}

type PaymentSummary = {
  id: string
  direction: "sent" | "received"
  amountBaseUnits: string
  status: string
  createdAt: number
  confirmedAt?: number
  txHash?: string
  destinationAddress: string
  counterparty: {
    displayName: string
    username: string
    avatarUrl?: string
  } | null
}

type PendingReconciliation = {
  paymentId: string
  sourceCustody: "circle" | "external"
  status: "awaiting-approval" | "submitted"
  txHash?: string
}

type WalletBalance = {
  amount: string | null
  baseUnits: string | null
  balanceAvailable: boolean
  walletAvailable: boolean
}

type SpendableBalance = {
  destinationAddress: string
  balanceBaseUnits: string
  spendableBaseUnits: string
  feeReserveBaseUnits: string
}

const createDraft = makeFunctionReference<
  "mutation",
  {
    recipient:
      { type: "coinarc"; userId: string } | { type: "address"; address: string }
    amountBaseUnits: string
    note?: string
    paymentRequestId?: string
    splitParticipantId?: string
    clientRequestId: string
  },
  DraftPayment
>("payments:createDraft")
const listHistory = makeFunctionReference<
  "query",
  { direction: "sent" | "received"; paginationOpts: PaginationOptions },
  {
    page: PaymentSummary[]
    isDone: boolean
    continueCursor: string
  }
>("payments:history")
const listPendingReconciliations = makeFunctionReference<
  "query",
  Record<string, never>,
  PendingReconciliation[]
>("payments:pendingReconciliation")
const cancelDraft = makeFunctionReference<
  "mutation",
  { paymentId: string },
  { cancelled: boolean }
>("payments:cancelDraft")

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

function amountToBaseUnits(amount: string) {
  const normalized = amount.trim()
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(normalized)) return null
  const baseUnits = parseUnits(normalized, ARC_TESTNET_USDC_DECIMALS)
  return baseUnits > BigInt(0) ? baseUnits : null
}

function isIncompleteAmount(amount: string) {
  return /^(?:0|[1-9]\d*)\.$/.test(amount.trim())
}

function baseUnitsFromApi(value: string | null | undefined) {
  return value && /^\d+$/.test(value) ? BigInt(value) : null
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
      return "Not sent"
  }
}

async function responseData(response: Response) {
  return (await response.json().catch(() => ({}))) as {
    challengeId?: string
    status?: "awaiting-approval" | "submitted" | "confirmed" | "failed"
    error?: string
  }
}

function pause(milliseconds: number) {
  return new Promise<void>((resolve) =>
    window.setTimeout(resolve, milliseconds)
  )
}

export function PayDrawer({
  onOpenChange,
  onOpenPayment,
  onReturnToRequest,
  onReturnToSplit,
  open,
  requestFulfillment,
  splitFulfillment,
}: {
  onOpenChange: (open: boolean) => void
  onOpenPayment: (paymentId: string) => void
  onReturnToRequest?: () => void
  onReturnToSplit?: () => void
  open: boolean
  requestFulfillment?: {
    requestId: string
    recipient: CoinArcRecipient
    amountBaseUnits: string
  } | null
  splitFulfillment?: SplitFulfillment | null
}) {
  const { address: connectedAddress } = useAccount()
  const chainId = useChainId()
  const { isAuthenticated } = useConvexAuth()
  const { writeContractAsync } = useWriteContract()
  const createPaymentDraft = useMutation(createDraft)
  const cancelPaymentDraft = useMutation(cancelDraft)
  const [tab, setTab] = useState<"send" | "history">("send")
  const [historyDirection, setHistoryDirection] = useState<
    "all" | "sent" | "received"
  >("all")
  const [recipient, setRecipient] = useState<PaymentRecipient | null>(() =>
    requestFulfillment || splitFulfillment
      ? {
          type: "coinarc",
          recipient: (requestFulfillment ?? splitFulfillment)!.recipient,
        }
      : null
  )
  const [amount, setAmount] = useState(() =>
    requestFulfillment || splitFulfillment
      ? formatUnits(
          BigInt((requestFulfillment ?? splitFulfillment)!.amountBaseUnits),
          ARC_TESTNET_USDC_DECIMALS
        )
      : ""
  )
  const [note, setNote] = useState("")
  const [reviewing, setReviewing] = useState(Boolean(requestFulfillment))
  const [draft, setDraft] = useState<DraftPayment | null>(null)
  const [clientRequestId, setClientRequestId] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [walletBalance, setWalletBalance] = useState<WalletBalance>()
  const [spendableBalance, setSpendableBalance] = useState<SpendableBalance>()
  const [reconciliationAttempt, setReconciliationAttempt] = useState(0)
  const isRequestFulfillment = Boolean(requestFulfillment)
  const isSplitFulfillment = Boolean(splitFulfillment)
  const isFeatureFulfillment = isRequestFulfillment || isSplitFulfillment

  const sentHistory = usePaginatedQuery(
    listHistory,
    isAuthenticated ? { direction: "sent" } : "skip",
    { initialNumItems: 20 }
  )
  const receivedHistory = usePaginatedQuery(
    listHistory,
    isAuthenticated ? { direction: "received" } : "skip",
    { initialNumItems: 20 }
  )
  const pendingReconciliations = useQuery(
    listPendingReconciliations,
    isAuthenticated ? {} : "skip"
  )
  const amountBaseUnits = useMemo(() => amountToBaseUnits(amount), [amount])
  const amountIsIncomplete = isIncompleteAmount(amount)
  const history = useMemo(() => {
    const records =
      historyDirection === "sent"
        ? sentHistory.results
        : historyDirection === "received"
          ? receivedHistory.results
          : [...sentHistory.results, ...receivedHistory.results]
    return [...records].sort(
      (first, second) => second.createdAt - first.createdAt
    )
  }, [historyDirection, receivedHistory.results, sentHistory.results])
  const historyLoading =
    !isAuthenticated ||
    (historyDirection !== "received" &&
      sentHistory.status === "LoadingFirstPage") ||
    (historyDirection !== "sent" &&
      receivedHistory.status === "LoadingFirstPage")
  const historyLoadingMore =
    (historyDirection !== "received" && sentHistory.status === "LoadingMore") ||
    (historyDirection !== "sent" && receivedHistory.status === "LoadingMore")
  const canLoadMoreHistory =
    (historyDirection !== "received" && sentHistory.status === "CanLoadMore") ||
    (historyDirection !== "sent" && receivedHistory.status === "CanLoadMore")
  const coinArcRecipient =
    recipient?.type === "coinarc" ? recipient.recipient : null
  const recipientAddress =
    recipient?.type === "coinarc"
      ? recipient.recipient.walletAddress
      : recipient?.type === "address"
        ? recipient.address
        : undefined
  const walletBalanceBaseUnits = baseUnitsFromApi(walletBalance?.baseUnits)
  const spendableBalanceMatchesRecipient =
    Boolean(recipientAddress) &&
    walletBalanceBaseUnits !== null &&
    spendableBalance?.destinationAddress.toLowerCase() ===
      recipientAddress?.toLowerCase() &&
    spendableBalance?.balanceBaseUnits === walletBalanceBaseUnits.toString()
  const spendableBalanceBaseUnits = baseUnitsFromApi(
    spendableBalanceMatchesRecipient
      ? spendableBalance?.spendableBaseUnits
      : undefined
  )
  const feeReserveBaseUnits = baseUnitsFromApi(
    spendableBalanceMatchesRecipient
      ? spendableBalance?.feeReserveBaseUnits
      : undefined
  )
  const amountExceedsBalance =
    amountBaseUnits !== null &&
    walletBalanceBaseUnits !== null &&
    amountBaseUnits > walletBalanceBaseUnits
  const amountExceedsSpendableBalance =
    amountBaseUnits !== null &&
    spendableBalanceBaseUnits !== null &&
    amountBaseUnits > spendableBalanceBaseUnits
  const amountLimitMessage = amountExceedsSpendableBalance
    ? feeReserveBaseUnits
      ? `Leave ${formatUnits(feeReserveBaseUnits, ARC_TESTNET_USDC_DECIMALS)} USDC available for estimated network fees.`
      : "This amount is not spendable after estimated network fees."
    : amountExceedsBalance
      ? "Insufficient USDC balance."
      : undefined
  const hasPendingPayment = Boolean(
    draft &&
    pendingReconciliations?.some(
      (payment) => payment.paymentId === draft.paymentId
    )
  )
  const recipientReady = recipient !== null
  const canReview =
    recipientReady &&
    amountBaseUnits !== null &&
    !amountExceedsBalance &&
    !amountExceedsSpendableBalance

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    void fetch("/api/wallet/balance", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load balance")
        return (await response.json()) as WalletBalance
      })
      .then((data) => setWalletBalance(data))
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setWalletBalance({
            amount: null,
            baseUnits: null,
            balanceAvailable: false,
            walletAvailable: false,
          })
        }
      })
    return () => controller.abort()
  }, [open])

  useEffect(() => {
    if (!open || !recipientAddress || !walletBalance?.balanceAvailable) {
      return
    }
    const controller = new AbortController()
    void fetch("/api/wallet/spendable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinationAddress: recipientAddress }),
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Could not estimate spendable balance")
        return (await response.json()) as SpendableBalance
      })
      .then((data) => setSpendableBalance(data))
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setSpendableBalance(undefined)
        }
      })
    return () => controller.abort()
  }, [
    open,
    recipientAddress,
    walletBalance?.balanceAvailable,
    walletBalance?.baseUnits,
  ])

  useEffect(() => {
    if (!isAuthenticated || !pendingReconciliations?.length) return
    let cancelled = false
    const authorization = readCircleAuthorization()

    const reconcile = async (payment: PendingReconciliation) => {
      if (payment.sourceCustody === "circle" && !authorization) return
      if (payment.sourceCustody === "external" && !payment.txHash) return
      try {
        const response = await fetch(
          payment.sourceCustody === "circle"
            ? "/api/payments/circle/reconcile"
            : "/api/payments/reconcile",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              payment.sourceCustody === "circle"
                ? {
                    paymentId: payment.paymentId,
                    userToken: authorization!.userToken,
                  }
                : { paymentId: payment.paymentId, txHash: payment.txHash }
            ),
          }
        )
        const data = await responseData(response)
        if (!cancelled && response.ok && data.status === "confirmed") {
          window.dispatchEvent(new Event("coinarc:payment-confirmed"))
        }
      } catch {
        // A later reconciliation attempt can recover a transient network failure.
      }
    }

    void Promise.all(pendingReconciliations.map(reconcile))
    const timeout = window.setTimeout(
      () => setReconciliationAttempt((attempt) => attempt + 1),
      15_000
    )
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [isAuthenticated, pendingReconciliations, reconciliationAttempt])

  function resetDraft() {
    setDraft(null)
    setClientRequestId(undefined)
    setStatus(undefined)
    setError(undefined)
  }

  function changeRecipient(nextRecipient: PaymentRecipient | null) {
    setRecipient(nextRecipient)
    setNote("")
    resetDraft()
  }

  function changeAmount(nextAmount: string) {
    setAmount(nextAmount)
    resetDraft()
  }

  function applyMaxAmount() {
    if (spendableBalanceBaseUnits === null) return
    changeAmount(
      formatUnits(spendableBalanceBaseUnits, ARC_TESTNET_USDC_DECIMALS)
    )
  }

  function loadMoreHistory() {
    if (
      historyDirection !== "received" &&
      sentHistory.status === "CanLoadMore"
    ) {
      sentHistory.loadMore(20)
    }
    if (
      historyDirection !== "sent" &&
      receivedHistory.status === "CanLoadMore"
    ) {
      receivedHistory.loadMore(20)
    }
  }

  async function draftPayment() {
    if (draft) return draft
    if (!amountBaseUnits || !recipient || !canReview) {
      if (amountLimitMessage) throw new Error(amountLimitMessage)
      throw new Error("Choose a recipient and enter a valid amount")
    }
    const requestId = clientRequestId ?? crypto.randomUUID()
    setClientRequestId(requestId)
    const requestedRecipient =
      recipient.type === "coinarc"
        ? { type: "coinarc" as const, userId: recipient.recipient.userId }
        : { type: "address" as const, address: recipient.address }
    const created = await createPaymentDraft({
      recipient: requestedRecipient,
      amountBaseUnits: amountBaseUnits.toString(),
      ...(coinArcRecipient && note.trim() ? { note: note.trim() } : {}),
      ...(requestFulfillment
        ? { paymentRequestId: requestFulfillment.requestId }
        : {}),
      ...(splitFulfillment
        ? { splitParticipantId: splitFulfillment.splitParticipantId }
        : {}),
      clientRequestId: requestId,
    })
    setDraft(created)
    return created
  }

  async function pollForConfirmation(
    endpoint: string,
    body: Record<string, string>
  ) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await pause(attempt === 0 ? 600 : 1_200)
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await responseData(response)
      if (!response.ok)
        throw new Error(data.error || "Could not confirm payment")
      if (data.status === "confirmed") return true
      if (data.status === "failed") {
        throw new Error("This payment could not be confirmed on Arc Testnet")
      }
    }
    return false
  }

  async function executeCirclePayment(payment: DraftPayment) {
    const authorization = readCircleAuthorization()
    const appId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID
    if (!authorization || !appId) {
      throw new Error(
        "Your secure Circle session has ended. Please sign in again."
      )
    }
    setStatus("Preparing secure wallet approval…")
    const preparation = await fetch("/api/payments/circle/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentId: payment.paymentId,
        userToken: authorization.userToken,
      }),
    })
    const prepared = await responseData(preparation)
    if (!preparation.ok || !prepared.challengeId) {
      throw new Error(
        prepared.error || "Could not prepare secure wallet approval"
      )
    }

    setStatus("Approve the payment in your CoinArc wallet…")
    const sdk = new W3SSdk({ appSettings: { appId } })
    sdk.setAuthentication({
      userToken: authorization.userToken,
      encryptionKey: authorization.encryptionKey,
    })
    await new Promise<void>((resolve, reject) => {
      sdk.execute(prepared.challengeId!, (challengeError) => {
        if (challengeError) reject(challengeError)
        else resolve()
      })
    })

    setStatus("Payment approved. Confirming it on Arc Testnet…")
    return await pollForConfirmation("/api/payments/circle/reconcile", {
      paymentId: payment.paymentId,
      userToken: authorization.userToken,
    })
  }

  async function executeExternalPayment(payment: DraftPayment) {
    if (!connectedAddress)
      throw new Error("Connect the wallet you signed in with")
    if (chainId !== ARC_TESTNET_CHAIN_ID) {
      throw new Error("Switch your connected wallet to Arc Testnet")
    }
    if (connectedAddress.toLowerCase() !== payment.sourceWalletAddress) {
      throw new Error("Connect the wallet you signed in with before paying")
    }
    setStatus("Confirm the USDC transfer in your wallet…")
    const txHash = await writeContractAsync({
      address: ARC_TESTNET_USDC_ADDRESS,
      abi: arcUsdcAbi,
      functionName: "transfer",
      args: [
        payment.destinationAddress as Address,
        BigInt(amountBaseUnits?.toString() ?? "0"),
      ],
    })
    setStatus("Transfer submitted. Confirming it on Arc Testnet…")
    return await pollForConfirmation("/api/payments/reconcile", {
      paymentId: payment.paymentId,
      txHash: txHash as Hash,
    })
  }

  async function sendPayment() {
    if (busy || hasPendingPayment) return
    setBusy(true)
    setError(undefined)
    let payment: DraftPayment | undefined
    try {
      payment = await draftPayment()
      const confirmed =
        payment.sourceCustody === "circle"
          ? await executeCirclePayment(payment)
          : await executeExternalPayment(payment)
      if (confirmed) {
        setStatus("Payment confirmed on Arc Testnet.")
        window.dispatchEvent(new Event("coinarc:payment-confirmed"))
        if (isFeatureFulfillment) {
          if (isRequestFulfillment) onReturnToRequest?.()
          else onReturnToSplit?.()
        } else {
          setTab("history")
        }
      } else {
        setStatus(
          "Payment is still confirming on Arc Testnet. It will appear in history only after confirmation."
        )
      }
    } catch (reason) {
      if (isFeatureFulfillment && payment) {
        try {
          const cancelled = await cancelPaymentDraft({
            paymentId: payment.paymentId,
          })
          if (cancelled.cancelled) {
            setDraft(null)
            setClientRequestId(undefined)
          }
        } catch {
          // A submitted payment must remain linked while it is reconciled.
        }
      }
      setStatus(undefined)
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not send this payment. Please try again."
      )
    } finally {
      setBusy(false)
    }
  }

  function beginReview() {
    if (!canReview) {
      setError(
        amountLimitMessage ??
          "Choose a recipient and enter a USDC amount with up to 6 decimals."
      )
      return
    }
    setError(undefined)
    setReviewing(true)
  }

  function closeDrawer() {
    if (!busy) handleDrawerOpenChange(false)
  }

  function handleDrawerOpenChange(nextOpen: boolean) {
    if (!nextOpen && isFeatureFulfillment && !busy) {
      if (isRequestFulfillment) onReturnToRequest?.()
      else onReturnToSplit?.()
      return
    }
    if (!nextOpen) {
      if (draft && status) {
        window.dispatchEvent(new Event("coinarc:wallet-balance-refresh"))
      }
      setReviewing(false)
      setStatus(undefined)
      setError(undefined)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Drawer onOpenChange={handleDrawerOpenChange} open={open} showSwipeHandle>
      <DrawerContent className="md:!mx-auto md:[--drawer-content-width:39rem]">
        <DrawerHeader>
          <DrawerTitle>
            {isRequestFulfillment
              ? "Pay request"
              : isSplitFulfillment
                ? "Pay your contribution"
                : "Pay"}
          </DrawerTitle>
          <DrawerDescription>
            {isRequestFulfillment
              ? "Pay this exact CoinArc payment request with USDC on Arc Testnet."
              : isSplitFulfillment
                ? `Contribute your fixed share to ${splitFulfillment?.title ?? "this split"}.`
                : "Send USDC on Arc Testnet to a CoinArc member or wallet address."}
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          <Tabs
            onValueChange={(value) => setTab(value as "send" | "history")}
            value={tab}
          >
            {!isFeatureFulfillment ? (
              <TabsList className="w-full">
                <TabsTrigger value="send">Send</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
            ) : null}

            <TabsContent className="pt-5" value="send">
              {reviewing ? (
                <div className="space-y-5">
                  <Button
                    className="-ml-3"
                    disabled={busy}
                    onClick={() => {
                      if (isFeatureFulfillment) {
                        if (isRequestFulfillment) onReturnToRequest?.()
                        else onReturnToSplit?.()
                      } else setReviewing(false)
                    }}
                    type="button"
                    variant="ghost"
                  >
                    <ArrowLeft />
                    {isRequestFulfillment
                      ? "Back to request"
                      : isSplitFulfillment
                        ? "Back to split"
                        : "Edit payment"}
                  </Button>
                  <div className="rounded-3xl border bg-muted/40 p-5">
                    <p className="text-sm text-muted-foreground">
                      You are sending
                    </p>
                    <p className="mt-1 text-3xl font-semibold tracking-tight">
                      {amountBaseUnits
                        ? formatUnits(
                            amountBaseUnits,
                            ARC_TESTNET_USDC_DECIMALS
                          )
                        : amount}{" "}
                      USDC
                    </p>
                    <div className="mt-5 flex items-center gap-3 border-t pt-4">
                      <Avatar>
                        {coinArcRecipient?.avatarUrl ? (
                          <AvatarImage
                            alt=""
                            src={coinArcRecipient.avatarUrl}
                          />
                        ) : null}
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {coinArcRecipient ? (
                            initials(coinArcRecipient.displayName)
                          ) : (
                            <WalletCards />
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-muted-foreground">
                          To
                        </span>
                        <span className="block truncate font-medium">
                          {coinArcRecipient?.displayName ??
                            (recipient?.type === "address"
                              ? shortAddress(recipient.address)
                              : "")}
                        </span>
                        {coinArcRecipient ? (
                          <span className="flex items-center gap-1 text-sm text-muted-foreground">
                            @{coinArcRecipient.username}
                            {coinArcRecipient.isFriend ? (
                              <Badge variant="outline">Friend</Badge>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                  {coinArcRecipient && note.trim() ? (
                    <div className="rounded-2xl border p-4">
                      <p className="text-xs font-medium text-muted-foreground">
                        Private CoinArc note
                      </p>
                      <p className="mt-1 text-sm whitespace-pre-wrap">
                        {note.trim()}
                      </p>
                    </div>
                  ) : null}
                  <p className="text-xs leading-5 text-muted-foreground">
                    The USDC transfer is on Arc Testnet. Your note is only
                    stored in CoinArc for you and this CoinArc recipient; it is
                    not included onchain.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {isSplitFulfillment ? (
                    <div className="rounded-2xl border bg-muted/40 p-4 text-sm text-muted-foreground">
                      You are contributing to{" "}
                      <span className="font-medium text-foreground">
                        {splitFulfillment?.title}
                      </span>
                      . Your recipient and amount are fixed so this payment
                      settles the correct share.
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <Label htmlFor="pay-recipient">To</Label>
                    <RecipientPicker
                      disabled={Boolean(busy) || isFeatureFulfillment}
                      id="pay-recipient"
                      onChange={changeRecipient}
                      value={recipient}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pay-amount">Amount</Label>
                    <div className="relative">
                      <Input
                        aria-invalid={amountLimitMessage ? true : undefined}
                        className="pr-28"
                        disabled={Boolean(busy) || isFeatureFulfillment}
                        id="pay-amount"
                        inputMode="decimal"
                        onChange={(event) => changeAmount(event.target.value)}
                        placeholder="0.00"
                        value={amount}
                      />
                      <span className="absolute inset-y-0 right-2 flex items-center gap-1 text-sm font-medium text-muted-foreground">
                        <Button
                          disabled={
                            busy ||
                            isFeatureFulfillment ||
                            spendableBalanceBaseUnits === null ||
                            spendableBalanceBaseUnits <= BigInt(0)
                          }
                          onClick={applyMaxAmount}
                          size="xs"
                          type="button"
                          variant="ghost"
                        >
                          Max
                        </Button>
                        <span className="pointer-events-none">USDC</span>
                      </span>
                    </div>
                    {amountLimitMessage ? (
                      <p className="text-xs text-destructive">
                        {amountLimitMessage}
                      </p>
                    ) : amount && !amountBaseUnits && !amountIsIncomplete ? (
                      <p className="text-xs text-destructive">
                        Enter a positive amount with up to 6 decimal places.
                      </p>
                    ) : null}
                    {walletBalance === undefined ? (
                      <p className="text-xs text-muted-foreground">
                        Checking available USDC balanceâ€¦
                      </p>
                    ) : walletBalance.balanceAvailable &&
                      walletBalanceBaseUnits !== null ? (
                      <p className="text-xs text-muted-foreground">
                        Available:{" "}
                        {formatUnits(
                          walletBalanceBaseUnits,
                          ARC_TESTNET_USDC_DECIMALS
                        )}{" "}
                        USDC
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Your balance could not be checked. Your wallet will
                        confirm the final amount.
                      </p>
                    )}
                  </div>

                  {coinArcRecipient ? (
                    <div className="space-y-2">
                      <Label htmlFor="pay-note">
                        {isSplitFulfillment
                          ? "Private note to collector (optional)"
                          : "Private note (optional)"}
                      </Label>
                      <Textarea
                        id="pay-note"
                        maxLength={280}
                        onChange={(event) => {
                          setNote(event.target.value)
                          resetDraft()
                        }}
                        placeholder="What is this for?"
                        value={note}
                      />
                      <p className="text-xs text-muted-foreground">
                        Visible only to you and @{coinArcRecipient.username} in
                        CoinArc. It is not written to Arc.
                      </p>
                    </div>
                  ) : (
                    <p className="rounded-2xl bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
                      Private notes are available when you pay a CoinArc member.
                    </p>
                  )}
                </div>
              )}

              {error ? (
                <p
                  className="mt-5 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
              {status ? (
                <p
                  className="mt-5 rounded-2xl bg-muted p-3 text-sm"
                  role="status"
                >
                  {busy ? (
                    <LoaderCircle className="mr-2 inline size-4 animate-spin" />
                  ) : null}
                  {status}
                </p>
              ) : null}
            </TabsContent>

            {!isFeatureFulfillment ? (
              <TabsContent className="pt-5" value="history">
                <Tabs
                  onValueChange={(value) =>
                    setHistoryDirection(value as "all" | "sent" | "received")
                  }
                  value={historyDirection}
                >
                  <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="sent">Sent</TabsTrigger>
                    <TabsTrigger value="received">Received</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="mt-4">
                  {historyLoading ? (
                    <p className="py-8 text-sm text-muted-foreground">
                      Loading payment history…
                    </p>
                  ) : history.length === 0 ? (
                    <Empty className="min-h-56 border-dashed">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Clock3 />
                        </EmptyMedia>
                        <EmptyTitle>No payments here yet</EmptyTitle>
                        <EmptyDescription>
                          Payments you send through CoinArc and confirmed
                          payments from CoinArc members will appear here.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <div className="divide-y overflow-hidden rounded-3xl border">
                      {history.map((payment) => {
                        const isSent = payment.direction === "sent"
                        const name =
                          payment.counterparty?.displayName ??
                          shortAddress(payment.destinationAddress)
                        return (
                          <Button
                            className="h-auto w-full justify-start rounded-none px-4 py-3 text-left hover:bg-muted"
                            key={payment.id}
                            onClick={() => onOpenPayment(payment.id)}
                            type="button"
                            variant="ghost"
                          >
                            <span
                              className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                                isSent
                                  ? "bg-muted"
                                  : "bg-primary text-primary-foreground"
                              }`}
                            >
                              {isSent ? (
                                <Send className="size-4" />
                              ) : (
                                <UserRound className="size-4" />
                              )}
                            </span>
                            <span className="ml-3 min-w-0 flex-1">
                              <span className="block truncate font-medium">
                                {isSent
                                  ? `You paid ${name}`
                                  : `${name} paid you`}
                              </span>
                              <span className="block text-sm text-muted-foreground">
                                {statusLabel(payment.status)} ·{" "}
                                {formatDistanceToNow(
                                  new Date(payment.createdAt),
                                  { addSuffix: true }
                                )}
                              </span>
                            </span>
                            <span className="ml-3 text-right font-medium tabular-nums">
                              {isSent ? "−" : "+"}
                              {formatUnits(
                                BigInt(payment.amountBaseUnits),
                                ARC_TESTNET_USDC_DECIMALS
                              )}
                            </span>
                          </Button>
                        )
                      })}
                    </div>
                  )}
                  {canLoadMoreHistory || historyLoadingMore ? (
                    <Button
                      className="mt-4 w-full"
                      disabled={historyLoadingMore}
                      onClick={loadMoreHistory}
                      type="button"
                      variant="outline"
                    >
                      {historyLoadingMore ? (
                        <LoaderCircle className="animate-spin" />
                      ) : null}
                      {historyLoadingMore ? "Loading payments…" : "Load more"}
                    </Button>
                  ) : null}
                </div>
              </TabsContent>
            ) : null}
          </Tabs>
        </div>

        <DrawerFooter>
          {tab === "send" ? (
            reviewing ? (
              <Button
                disabled={!canReview || busy || hasPendingPayment}
                onClick={() => void sendPayment()}
                type="button"
              >
                {busy ? <LoaderCircle className="animate-spin" /> : <Send />}
                {busy
                  ? "Sending payment…"
                  : hasPendingPayment
                    ? "Confirming payment…"
                    : isRequestFulfillment
                      ? "Pay request"
                      : isSplitFulfillment
                        ? "Pay contribution"
                        : "Send USDC"}
              </Button>
            ) : (
              <Button
                disabled={!canReview || busy}
                onClick={beginReview}
                type="button"
              >
                Review payment
                <ChevronRight />
              </Button>
            )
          ) : null}
          <Button
            disabled={busy}
            onClick={closeDrawer}
            type="button"
            variant="outline"
          >
            {isRequestFulfillment
              ? "Back to request"
              : isSplitFulfillment
                ? "Back to split"
                : "Close"}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

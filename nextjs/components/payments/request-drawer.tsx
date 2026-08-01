"use client"

import {
  ArrowLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  LoaderCircle,
  Send,
  UserRound,
} from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"
import { formatUnits, parseUnits } from "viem"
import { useMemo, useState } from "react"
import {
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react"
import { makeFunctionReference, type PaginationOptions } from "convex/server"

import {
  RecipientPicker,
  type CoinArcRecipient,
  type PaymentRecipient,
} from "@/components/recipient-picker"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  ARC_TESTNET_EXPLORER,
  ARC_TESTNET_USDC_DECIMALS,
} from "@/lib/arc-testnet"

type RequestSummary = {
  id: string
  direction: "sent" | "received"
  amountBaseUnits: string
  status: RequestStatus
  createdAt: number
  expiresAt: number
  counterparty: {
    displayName: string
    username: string
    avatarUrl?: string
  } | null
}

type RequestStatus =
  | "pending"
  | "payment-processing"
  | "completed"
  | "declined"
  | "cancelled"
  | "expired"

type RequestDetails = {
  id: string
  direction: "sent" | "received"
  amountBaseUnits: string
  status: RequestStatus
  createdAt: number
  expiresAt: number
  paymentStartedAt?: number
  completedAt?: number
  declinedAt?: number
  cancelledAt?: number
  expiredAt?: number
  requesterWalletAddress: string
  counterparty: (CoinArcRecipient & { isFriend: true }) | null
  note?: string
  payment: {
    id: string
    status: string
    txHash?: string
    confirmedAt?: number
  } | null
}

export type RequestFulfillment = {
  requestId: string
  recipient: CoinArcRecipient
  amountBaseUnits: string
}

const createRequest = makeFunctionReference<
  "mutation",
  {
    recipientId: string
    amountBaseUnits: string
    note?: string
    expiresInDays: number
    clientRequestId: string
  },
  { requestId: string }
>("paymentRequests:create")
const listHistory = makeFunctionReference<
  "query",
  { direction: "sent" | "received"; paginationOpts: PaginationOptions },
  {
    page: RequestSummary[]
    isDone: boolean
    continueCursor: string
  }
>("paymentRequests:history")
const requestDetails = makeFunctionReference<
  "query",
  { requestId: string },
  RequestDetails
>("paymentRequests:details")
const declineRequest = makeFunctionReference<
  "mutation",
  { requestId: string },
  { status: RequestStatus }
>("paymentRequests:decline")
const cancelRequest = makeFunctionReference<
  "mutation",
  { requestId: string },
  { status: RequestStatus }
>("paymentRequests:cancel")

function initials(displayName: string) {
  return displayName
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
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

function statusLabel(status: RequestStatus) {
  switch (status) {
    case "pending":
      return "Pending"
    case "payment-processing":
      return "Payment processing"
    case "completed":
      return "Completed"
    case "declined":
      return "Declined"
    case "cancelled":
      return "Cancelled"
    case "expired":
      return "Expired"
  }
}

function statusDescription(request: RequestDetails) {
  const name = request.counterparty?.displayName ?? "Your friend"
  switch (request.status) {
    case "pending":
      return request.direction === "received"
        ? `${name} is waiting for your payment.`
        : `Waiting for ${name} to respond.`
    case "payment-processing":
      return "The payment has started and is being confirmed on Arc Testnet."
    case "completed":
      return "The payment was confirmed on Arc Testnet."
    case "declined":
      return request.direction === "sent"
        ? `${name} declined this request.`
        : "You declined this request."
    case "cancelled":
      return request.direction === "sent"
        ? "You cancelled this request."
        : `${name} cancelled this request.`
    case "expired":
      return "This request expired before it was paid."
  }
}

function statusVariant(status: RequestStatus) {
  return status === "declined" ? "destructive" : "secondary"
}

export function RequestDrawer({
  onBackToHistory,
  onOpenChange,
  onPayRequest,
  open,
  requestId,
}: {
  onBackToHistory: () => void
  onOpenChange: (open: boolean) => void
  onPayRequest: (request: RequestFulfillment) => void
  open: boolean
  requestId: string | null
}) {
  const { isAuthenticated } = useConvexAuth()
  const createPaymentRequest = useMutation(createRequest)
  const declinePaymentRequest = useMutation(declineRequest)
  const cancelPaymentRequest = useMutation(cancelRequest)
  const [tab, setTab] = useState<"request" | "history">("request")
  const [historyDirection, setHistoryDirection] = useState<
    "all" | "sent" | "received"
  >("all")
  const [view, setView] = useState<"form" | "review" | "detail">("form")
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null
  )
  const [recipient, setRecipient] = useState<PaymentRecipient | null>(null)
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [expiresInDays, setExpiresInDays] = useState("7")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

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
  const activeRequestId = requestId ?? selectedRequestId
  const activeView = requestId ? "detail" : view
  const detail = useQuery(
    requestDetails,
    activeRequestId && isAuthenticated ? { requestId: activeRequestId } : "skip"
  )
  const amountBaseUnits = useMemo(() => amountToBaseUnits(amount), [amount])
  const amountIsIncomplete = isIncompleteAmount(amount)
  const coinArcRecipient =
    recipient?.type === "coinarc" ? recipient.recipient : null
  const canReview = Boolean(coinArcRecipient && amountBaseUnits)
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

  function resetForm() {
    setRecipient(null)
    setAmount("")
    setNote("")
    setExpiresInDays("7")
    setView("form")
    setError(undefined)
  }

  function closeDrawer() {
    if (busy) return
    setSelectedRequestId(null)
    setView("form")
    setError(undefined)
    onOpenChange(false)
  }

  function openDetail(id: string) {
    setSelectedRequestId(id)
    setView("detail")
    setError(undefined)
  }

  function returnToHistory() {
    setSelectedRequestId(null)
    setView("form")
    setTab("history")
    setError(undefined)
    if (requestId) onBackToHistory()
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

  async function sendRequest() {
    if (!coinArcRecipient || !amountBaseUnits || busy) return
    setBusy(true)
    setError(undefined)
    try {
      const created = await createPaymentRequest({
        recipientId: coinArcRecipient.userId,
        amountBaseUnits: amountBaseUnits.toString(),
        ...(note.trim() ? { note: note.trim() } : {}),
        expiresInDays: Number(expiresInDays),
        clientRequestId: crypto.randomUUID(),
      })
      openDetail(created.requestId)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not send this request. Please try again."
      )
    } finally {
      setBusy(false)
    }
  }

  async function declineCurrentRequest() {
    if (!detail || busy) return
    setBusy(true)
    setError(undefined)
    try {
      await declinePaymentRequest({ requestId: detail.id })
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not decline this request. Please try again."
      )
    } finally {
      setBusy(false)
    }
  }

  async function cancelCurrentRequest() {
    if (!detail || busy) return
    setBusy(true)
    setError(undefined)
    try {
      await cancelPaymentRequest({ requestId: detail.id })
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not cancel this request. Please try again."
      )
    } finally {
      setBusy(false)
    }
  }

  function beginReview() {
    if (!canReview) {
      setError("Choose a friend and enter a USDC amount with up to 6 decimals.")
      return
    }
    setError(undefined)
    setView("review")
  }

  function payCurrentRequest() {
    if (!detail?.counterparty) return
    onPayRequest({
      requestId: detail.id,
      recipient: {
        ...detail.counterparty,
        walletAddress: detail.requesterWalletAddress,
      },
      amountBaseUnits: detail.amountBaseUnits,
    })
  }

  const detailTitle =
    detail?.direction === "sent" ? "Payment request sent" : "Payment request"

  return (
    <Drawer
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeDrawer()
      }}
      open={open}
      showSwipeHandle
    >
      <DrawerContent className="md:!mx-auto md:[--drawer-content-width:39rem]">
        <DrawerHeader>
          {activeView === "detail" ? (
            <Button
              className="mb-1 -ml-3 w-fit"
              disabled={busy}
              onClick={returnToHistory}
              type="button"
              variant="ghost"
            >
              <ArrowLeft />
              Request history
            </Button>
          ) : null}
          <DrawerTitle>
            {activeView === "detail" ? detailTitle : "Request payment"}
          </DrawerTitle>
          <DrawerDescription>
            {activeView === "detail"
              ? "Review this private CoinArc payment request."
              : "Ask a friend to pay you a specific USDC amount in CoinArc."}
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          {activeView === "detail" ? (
            detail === undefined ? (
              <p className="py-8 text-sm text-muted-foreground">
                Loading request details…
              </p>
            ) : detail ? (
              <RequestDetail detail={detail} />
            ) : (
              <Empty className="min-h-56 border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Clock3 />
                  </EmptyMedia>
                  <EmptyTitle>Request unavailable</EmptyTitle>
                  <EmptyDescription>
                    This request may no longer be available to your CoinArc
                    account.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )
          ) : (
            <Tabs
              onValueChange={(value) => {
                setTab(value as "request" | "history")
                if (value === "request") resetForm()
              }}
              value={tab}
            >
              <TabsList className="w-full">
                <TabsTrigger value="request">Request</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>

              <TabsContent className="pt-5" value="request">
                {activeView === "review" ? (
                  <div className="space-y-5">
                    <Button
                      className="-ml-3"
                      disabled={busy}
                      onClick={() => setView("form")}
                      type="button"
                      variant="ghost"
                    >
                      <ArrowLeft />
                      Edit request
                    </Button>
                    <div className="rounded-3xl border bg-muted/40 p-5">
                      <p className="text-sm text-muted-foreground">
                        You are requesting
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
                      {coinArcRecipient ? (
                        <div className="mt-5 flex items-center gap-3 border-t pt-4">
                          <Avatar>
                            {coinArcRecipient.avatarUrl ? (
                              <AvatarImage
                                alt=""
                                src={coinArcRecipient.avatarUrl}
                              />
                            ) : null}
                            <AvatarFallback className="bg-primary text-primary-foreground">
                              {initials(coinArcRecipient.displayName)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs text-muted-foreground">
                              From
                            </span>
                            <span className="block truncate font-medium">
                              {coinArcRecipient.displayName}
                            </span>
                            <span className="block truncate text-sm text-muted-foreground">
                              @{coinArcRecipient.username}
                            </span>
                          </span>
                        </div>
                      ) : null}
                    </div>
                    {note.trim() ? (
                      <div className="rounded-2xl border p-4">
                        <p className="text-xs font-medium text-muted-foreground">
                          Private CoinArc note
                        </p>
                        <p className="mt-1 text-sm whitespace-pre-wrap">
                          {note.trim()}
                        </p>
                      </div>
                    ) : null}
                    <p className="text-sm text-muted-foreground">
                      Expires {Number(expiresInDays)} days after it is sent.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="request-recipient">From</Label>
                      <RecipientPicker
                        disabled={busy}
                        friendsOnly
                        id="request-recipient"
                        onChange={setRecipient}
                        value={recipient}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="request-amount">Amount</Label>
                      <div className="relative">
                        <Input
                          id="request-amount"
                          inputMode="decimal"
                          onChange={(event) => setAmount(event.target.value)}
                          placeholder="0.00"
                          value={amount}
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-muted-foreground">
                          USDC
                        </span>
                      </div>
                      {amount && !amountBaseUnits && !amountIsIncomplete ? (
                        <p className="text-xs text-destructive">
                          Enter a positive amount with up to 6 decimal places.
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="request-note">
                        Private note (optional)
                      </Label>
                      <Textarea
                        id="request-note"
                        maxLength={280}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="What is this for?"
                        value={note}
                      />
                      <p className="text-xs text-muted-foreground">
                        Visible only to you and your friend in CoinArc. It is
                        not written to Arc.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="request-expiry">Expires in</Label>
                      <NativeSelect
                        id="request-expiry"
                        onChange={(event) =>
                          setExpiresInDays(event.target.value)
                        }
                        value={expiresInDays}
                      >
                        <NativeSelectOption value="1">1 day</NativeSelectOption>
                        <NativeSelectOption value="3">
                          3 days
                        </NativeSelectOption>
                        <NativeSelectOption value="7">
                          7 days
                        </NativeSelectOption>
                        <NativeSelectOption value="14">
                          14 days
                        </NativeSelectOption>
                        <NativeSelectOption value="30">
                          30 days
                        </NativeSelectOption>
                      </NativeSelect>
                    </div>
                  </div>
                )}
              </TabsContent>

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
                      Loading request history…
                    </p>
                  ) : history.length === 0 ? (
                    <Empty className="min-h-56 border-dashed">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Clock3 />
                        </EmptyMedia>
                        <EmptyTitle>No requests here yet</EmptyTitle>
                        <EmptyDescription>
                          Requests you send and receive from friends will appear
                          here.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <div className="divide-y overflow-hidden rounded-3xl border">
                      {history.map((request) => {
                        const isSent = request.direction === "sent"
                        const amount = formatUnits(
                          BigInt(request.amountBaseUnits),
                          ARC_TESTNET_USDC_DECIMALS
                        )
                        const name =
                          request.counterparty?.displayName ?? "a friend"
                        return (
                          <Button
                            className="h-auto w-full justify-start rounded-none px-4 py-3 text-left hover:bg-muted"
                            key={request.id}
                            onClick={() => openDetail(request.id)}
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
                                  ? `You requested payment from ${name}`
                                  : `${name} requested payment from you`}
                              </span>
                              <span className="block text-sm text-muted-foreground">
                                {statusLabel(request.status)} ·{" "}
                                {formatDistanceToNow(
                                  new Date(request.createdAt),
                                  { addSuffix: true }
                                )}
                              </span>
                            </span>
                            <span className="ml-3 font-medium tabular-nums">
                              {amount}
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
                      {historyLoadingMore ? "Loading requests…" : "Load more"}
                    </Button>
                  ) : null}
                </div>
              </TabsContent>
            </Tabs>
          )}

          {error ? (
            <p
              className="mt-5 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>

        <DrawerFooter>
          {activeView === "detail" && detail ? (
            <>
              {detail.status === "pending" &&
              detail.direction === "received" ? (
                <>
                  <Button
                    disabled={busy || !detail.counterparty}
                    onClick={payCurrentRequest}
                    type="button"
                  >
                    <Send />
                    Pay{" "}
                    {formatUnits(
                      BigInt(detail.amountBaseUnits),
                      ARC_TESTNET_USDC_DECIMALS
                    )}{" "}
                    USDC
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => void declineCurrentRequest()}
                    type="button"
                    variant="outline"
                  >
                    {busy ? <LoaderCircle className="animate-spin" /> : null}
                    Decline
                  </Button>
                </>
              ) : null}
              {detail.status === "pending" && detail.direction === "sent" ? (
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button disabled={busy} type="button" variant="outline" />
                    }
                  >
                    Cancel request
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel this request?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Your friend will no longer be able to pay this request.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep request</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => void cancelCurrentRequest()}
                      >
                        Cancel request
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
              {detail.status === "completed" && detail.payment?.txHash ? (
                <Button
                  render={
                    <a
                      href={`${ARC_TESTNET_EXPLORER}/tx/${detail.payment.txHash}`}
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
            </>
          ) : tab === "request" ? (
            activeView === "review" ? (
              <Button
                disabled={!canReview || busy}
                onClick={() => void sendRequest()}
                type="button"
              >
                {busy ? <LoaderCircle className="animate-spin" /> : <Send />}
                {busy ? "Sending request…" : "Send request"}
              </Button>
            ) : (
              <Button
                disabled={!canReview || busy}
                onClick={beginReview}
                type="button"
              >
                Review request
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
            Close
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function RequestDetail({ detail }: { detail: RequestDetails }) {
  const amount = formatUnits(
    BigInt(detail.amountBaseUnits),
    ARC_TESTNET_USDC_DECIMALS
  )
  const name = detail.counterparty?.displayName ?? "CoinArc friend"
  const statusAt =
    detail.completedAt ??
    detail.declinedAt ??
    detail.cancelledAt ??
    detail.expiredAt ??
    detail.paymentStartedAt

  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-muted p-5 text-center">
        <p className="text-3xl font-semibold tracking-tight">{amount} USDC</p>
        <Badge className="mt-3" variant={statusVariant(detail.status)}>
          {statusLabel(detail.status)}
        </Badge>
        <p className="mt-3 text-sm text-muted-foreground">
          {statusDescription(detail)}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Avatar>
          {detail.counterparty?.avatarUrl ? (
            <AvatarImage alt="" src={detail.counterparty.avatarUrl} />
          ) : null}
          <AvatarFallback className="bg-primary text-primary-foreground">
            {detail.counterparty ? (
              initials(detail.counterparty.displayName)
            ) : (
              <UserRound />
            )}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted-foreground">
            {detail.direction === "sent" ? "Requested from" : "Requested by"}
          </span>
          <span className="block truncate font-medium">{name}</span>
          {detail.counterparty ? (
            <span className="block truncate text-sm text-muted-foreground">
              @{detail.counterparty.username}
            </span>
          ) : null}
        </span>
      </div>

      <Separator />

      <dl className="space-y-3 text-sm">
        <div className="flex items-start justify-between gap-5">
          <dt className="text-muted-foreground">Requested</dt>
          <dd className="text-right font-medium">
            {format(new Date(detail.createdAt), "MMM d, yyyy, h:mm a")}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-5">
          <dt className="text-muted-foreground">Expires</dt>
          <dd className="text-right font-medium">
            {detail.status === "expired"
              ? "Expired"
              : format(new Date(detail.expiresAt), "MMM d, yyyy, h:mm a")}
          </dd>
        </div>
        {statusAt ? (
          <div className="flex items-start justify-between gap-5">
            <dt className="text-muted-foreground">Updated</dt>
            <dd className="text-right font-medium">
              {format(new Date(statusAt), "MMM d, yyyy, h:mm a")}
            </dd>
          </div>
        ) : null}
      </dl>

      {detail.note ? (
        <div className="rounded-2xl border bg-muted/40 p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Private CoinArc note
          </p>
          <p className="mt-1 text-sm whitespace-pre-wrap">{detail.note}</p>
        </div>
      ) : null}
    </div>
  )
}

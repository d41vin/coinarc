"use client"

import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk"
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock3,
  LoaderCircle,
  Send,
  UserRound,
  WalletCards,
} from "lucide-react"
import { useMemo, useState } from "react"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { makeFunctionReference } from "convex/server"
import { formatDistanceToNow } from "date-fns"
import {
  formatUnits,
  isAddress,
  parseUnits,
  type Address,
  type Hash,
} from "viem"
import { useAccount, useChainId, useWriteContract } from "wagmi"

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_USDC_ADDRESS,
  ARC_TESTNET_USDC_DECIMALS,
  arcUsdcAbi,
} from "@/lib/arc-testnet"
import { readCircleAuthorization } from "@/lib/circle-authorization"

type Recipient = {
  displayName: string
  username: string
  avatarUrl?: string
  isFriend: boolean
}

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

const searchRecipients = makeFunctionReference<
  "query",
  { query: string },
  Recipient[]
>("payments:searchRecipients")
const createDraft = makeFunctionReference<
  "mutation",
  {
    recipient:
      | { type: "coinarc"; username: string }
      | { type: "address"; address: string }
    amountBaseUnits: string
    note?: string
    clientRequestId: string
  },
  DraftPayment
>("payments:createDraft")
const listHistory = makeFunctionReference<
  "query",
  { direction: "all" | "sent" | "received" },
  PaymentSummary[]
>("payments:history")

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
  open,
}: {
  onOpenChange: (open: boolean) => void
  onOpenPayment: (paymentId: string) => void
  open: boolean
}) {
  const { address: connectedAddress } = useAccount()
  const chainId = useChainId()
  const { isAuthenticated } = useConvexAuth()
  const { writeContractAsync } = useWriteContract()
  const createPaymentDraft = useMutation(createDraft)
  const [tab, setTab] = useState<"send" | "history">("send")
  const [historyDirection, setHistoryDirection] = useState<
    "all" | "sent" | "received"
  >("all")
  const [recipientInput, setRecipientInput] = useState("")
  const [recipient, setRecipient] = useState<Recipient | null>(null)
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [reviewing, setReviewing] = useState(false)
  const [draft, setDraft] = useState<DraftPayment | null>(null)
  const [clientRequestId, setClientRequestId] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const normalizedRecipientInput = recipientInput.trim()
  const isWalletAddress = isAddress(normalizedRecipientInput, {
    strict: false,
  })
  const recipientSearch = useQuery(
    searchRecipients,
    isAuthenticated &&
      !recipient &&
      !isWalletAddress &&
      normalizedRecipientInput.length >= 2
      ? { query: normalizedRecipientInput }
      : "skip"
  )
  const history = useQuery(
    listHistory,
    isAuthenticated ? { direction: historyDirection } : "skip"
  )
  const amountBaseUnits = useMemo(() => amountToBaseUnits(amount), [amount])
  const recipientReady = Boolean(recipient || isWalletAddress)
  const canReview = recipientReady && amountBaseUnits !== null

  function resetDraft() {
    setDraft(null)
    setClientRequestId(undefined)
    setStatus(undefined)
    setError(undefined)
  }

  function selectRecipient(nextRecipient: Recipient) {
    setRecipient(nextRecipient)
    setRecipientInput(nextRecipient.displayName)
    resetDraft()
  }

  function changeRecipientInput(nextInput: string) {
    setRecipientInput(nextInput)
    setRecipient(null)
    resetDraft()
  }

  function changeAmount(nextAmount: string) {
    setAmount(nextAmount)
    resetDraft()
  }

  async function draftPayment() {
    if (draft) return draft
    if (!amountBaseUnits || !recipientReady) {
      throw new Error("Choose a recipient and enter a valid amount")
    }
    const requestId = clientRequestId ?? crypto.randomUUID()
    setClientRequestId(requestId)
    const created = await createPaymentDraft({
      recipient: recipient
        ? { type: "coinarc", username: recipient.username }
        : { type: "address", address: normalizedRecipientInput },
      amountBaseUnits: amountBaseUnits.toString(),
      ...(recipient && note.trim() ? { note: note.trim() } : {}),
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
    if (busy) return
    setBusy(true)
    setError(undefined)
    try {
      const payment = await draftPayment()
      const confirmed =
        payment.sourceCustody === "circle"
          ? await executeCirclePayment(payment)
          : await executeExternalPayment(payment)
      if (confirmed) {
        setStatus("Payment confirmed on Arc Testnet.")
        setTab("history")
        window.dispatchEvent(new Event("coinarc:payment-confirmed"))
      } else {
        setStatus(
          "Payment submitted. It will appear in history when Arc confirms it."
        )
        setTab("history")
      }
    } catch (reason) {
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
    if (!nextOpen) {
      setReviewing(false)
      setStatus(undefined)
      setError(undefined)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Drawer onOpenChange={handleDrawerOpenChange} open={open} showSwipeHandle>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Pay</DrawerTitle>
          <DrawerDescription>
            Send USDC on Arc Testnet to a CoinArc member or wallet address.
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          <Tabs
            onValueChange={(value) => setTab(value as "send" | "history")}
            value={tab}
          >
            <TabsList className="w-full">
              <TabsTrigger value="send">Send</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent className="pt-5" value="send">
              {reviewing ? (
                <div className="space-y-5">
                  <Button
                    className="-ml-3"
                    disabled={busy}
                    onClick={() => setReviewing(false)}
                    type="button"
                    variant="ghost"
                  >
                    <ArrowLeft />
                    Edit payment
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
                        {recipient?.avatarUrl ? (
                          <AvatarImage alt="" src={recipient.avatarUrl} />
                        ) : null}
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {recipient ? (
                            initials(recipient.displayName)
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
                          {recipient?.displayName ??
                            shortAddress(normalizedRecipientInput)}
                        </span>
                        {recipient ? (
                          <span className="flex items-center gap-1 text-sm text-muted-foreground">
                            @{recipient.username}
                            {recipient.isFriend ? (
                              <Badge variant="outline">Friend</Badge>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                  {recipient && note.trim() ? (
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
                  <div className="space-y-2">
                    <Label htmlFor="pay-recipient">To</Label>
                    <Input
                      autoComplete="off"
                      id="pay-recipient"
                      onChange={(event) =>
                        changeRecipientInput(event.target.value)
                      }
                      placeholder="Name, @username, or wallet address"
                      value={recipientInput}
                    />
                    {recipient ? (
                      <div className="flex items-center gap-3 rounded-2xl border p-3">
                        <Avatar>
                          {recipient.avatarUrl ? (
                            <AvatarImage alt="" src={recipient.avatarUrl} />
                          ) : null}
                          <AvatarFallback className="bg-primary text-primary-foreground">
                            {initials(recipient.displayName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {recipient.displayName}
                          </span>
                          <span className="flex items-center gap-1 text-sm text-muted-foreground">
                            @{recipient.username}
                            {recipient.isFriend ? (
                              <Badge variant="outline">Friend</Badge>
                            ) : null}
                          </span>
                        </span>
                        <Check className="size-5 text-primary" />
                      </div>
                    ) : isWalletAddress ? (
                      <div className="flex items-center gap-3 rounded-2xl border p-3 text-sm">
                        <span className="flex size-9 items-center justify-center rounded-full bg-muted">
                          <WalletCards className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">
                            Wallet address
                          </span>
                          <span className="block truncate font-mono text-xs text-muted-foreground">
                            {normalizedRecipientInput}
                          </span>
                        </span>
                        <Check className="size-5 text-primary" />
                      </div>
                    ) : recipientSearch?.length ? (
                      <div className="overflow-hidden rounded-2xl border">
                        {recipientSearch.map((result) => (
                          <Button
                            className="h-auto w-full justify-start rounded-none px-3 py-3 text-left hover:bg-muted"
                            key={result.username}
                            onClick={() => selectRecipient(result)}
                            type="button"
                            variant="ghost"
                          >
                            <Avatar className="mr-3">
                              {result.avatarUrl ? (
                                <AvatarImage alt="" src={result.avatarUrl} />
                              ) : null}
                              <AvatarFallback className="bg-primary text-primary-foreground">
                                {initials(result.displayName)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">
                                {result.displayName}
                              </span>
                              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                                @{result.username}
                                {result.isFriend ? (
                                  <Badge variant="outline">Friend</Badge>
                                ) : null}
                              </span>
                            </span>
                            <ChevronRight className="size-4 text-muted-foreground" />
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pay-amount">Amount</Label>
                    <div className="relative">
                      <Input
                        id="pay-amount"
                        inputMode="decimal"
                        onChange={(event) => changeAmount(event.target.value)}
                        placeholder="0.00"
                        value={amount}
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-muted-foreground">
                        USDC
                      </span>
                    </div>
                    {amount && !amountBaseUnits ? (
                      <p className="text-xs text-destructive">
                        Enter a positive amount with up to 6 decimal places.
                      </p>
                    ) : null}
                  </div>

                  {recipient ? (
                    <div className="space-y-2">
                      <Label htmlFor="pay-note">Private note (optional)</Label>
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
                        Visible only to you and @{recipient.username} in
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
                {history === undefined ? (
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
                        Sent and received CoinArc payments will appear here.
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
                              {isSent ? `You paid ${name}` : `${name} paid you`}
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
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DrawerFooter>
          {tab === "send" ? (
            reviewing ? (
              <Button
                disabled={busy}
                onClick={() => void sendPayment()}
                type="button"
              >
                {busy ? <LoaderCircle className="animate-spin" /> : <Send />}
                {busy ? "Sending payment…" : "Send USDC"}
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
            Close
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

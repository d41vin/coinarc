"use client"

import {
  ArrowLeft,
  Bell,
  Check,
  ChevronRight,
  CircleDollarSign,
  LoaderCircle,
  Send,
  UserRound,
  UserRoundX,
  UsersRound,
  X,
} from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"
import { useMemo, useState } from "react"
import {
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react"
import { makeFunctionReference } from "convex/server"
import { formatUnits, parseUnits } from "viem"

import type { CoinArcRecipient } from "@/components/recipient-picker"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
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
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
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
import { ARC_TESTNET_USDC_DECIMALS } from "@/lib/arc-testnet"

type PaginationOptions = {
  cursor: string | null
  numItems: number
}

type SplitStatus = "active" | "completed" | "closed" | "cancelled" | "expired"
type ParticipantStatus =
  | "pending"
  | "payment-processing"
  | "paid-in-app"
  | "paid-outside"
  | "declined"
  | "cancelled"

type SplitSummary = {
  id: string
  role: "collecting" | "contributing"
  title: string
  emoji?: string
  status: SplitStatus
  createdAt: number
  expiresAt?: number
  collectionTargetBaseUnits: string
  collectedBaseUnits: string
  participantCount: number
  ownAmountBaseUnits?: string
  ownStatus?: ParticipantStatus
  creator: Profile | null
}

type Profile = {
  displayName: string
  username: string
  avatarUrl?: string
}

type SplitDetails = {
  id: string
  isCreator: boolean
  creatorId: string
  title: string
  description?: string
  emoji?: string
  splitMode: "equal" | "custom"
  status: SplitStatus
  createdAt: number
  expiresAt?: number
  completedAt?: number
  closedAt?: number
  cancelledAt?: number
  totalAmountBaseUnits: string
  creatorShareBaseUnits: string
  collectionTargetBaseUnits: string
  collectedBaseUnits: string
  collectorWalletAddress: string
  creator: Profile | null
  ownParticipantId?: string
  participants: {
    id: string
    amountBaseUnits: string
    status: ParticipantStatus
    invitedAt: number
    paymentStartedAt?: number
    paidAt?: number
    paidOutsideAt?: number
    declinedAt?: number
    cancelledAt?: number
    reminderSentAt?: number
    paymentId?: string
    profile: Profile | null
  }[]
}

export type SplitFulfillment = {
  splitParticipantId: string
  splitId: string
  title: string
  recipient: CoinArcRecipient
  amountBaseUnits: string
}

const searchFriends = makeFunctionReference<
  "query",
  { query: string },
  CoinArcRecipient[]
>("paymentRequests:searchFriends")
const createSplit = makeFunctionReference<
  "mutation",
  {
    title: string
    description?: string
    emoji?: string
    totalAmountBaseUnits: string
    includeCreatorShare: boolean
    creatorShareBaseUnits?: string
    splitMode: "equal" | "custom"
    participantIds: string[]
    customShares?: { participantId: string; amountBaseUnits: string }[]
    expiresInDays?: number
    clientRequestId: string
  },
  { splitId: string }
>("splits:create")
const listHistory = makeFunctionReference<
  "query",
  { role: "collecting" | "contributing"; paginationOpts: PaginationOptions },
  { page: SplitSummary[]; isDone: boolean; continueCursor: string }
>("splits:history")
const splitDetails = makeFunctionReference<
  "query",
  { splitId: string },
  SplitDetails
>("splits:details")
const declineSplit = makeFunctionReference<
  "mutation",
  { splitParticipantId: string },
  { status: "declined" }
>("splits:decline")
const remindParticipant = makeFunctionReference<
  "mutation",
  { splitParticipantId: string },
  { sentAt: number }
>("splits:remind")
const markPaidOutside = makeFunctionReference<
  "mutation",
  { splitParticipantId: string },
  { status: "paid-outside" }
>("splits:markPaidOutside")
const extendDeadline = makeFunctionReference<
  "mutation",
  { splitId: string; expiresInDays: number },
  { expiresAt: number }
>("splits:extendDeadline")
const closeSplit = makeFunctionReference<
  "mutation",
  { splitId: string },
  { status: "closed" }
>("splits:close")
const cancelSplit = makeFunctionReference<
  "mutation",
  { splitId: string },
  { status: "cancelled" }
>("splits:cancel")

const emojiOptions = ["🍽️", "🎉", "✈️", "🏠", "🛒", "🎁", "🚕", "📦"]

function initials(displayName: string) {
  return displayName
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function amountToBaseUnits(amount: string, allowZero = false) {
  const normalized = amount.trim()
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(normalized)) return null
  const baseUnits = parseUnits(normalized, ARC_TESTNET_USDC_DECIMALS)
  return baseUnits > BigInt(0) || (allowZero && baseUnits === BigInt(0))
    ? baseUnits
    : null
}

function isIncompleteAmount(amount: string) {
  return /^(?:0|[1-9]\d*)\.$/.test(amount.trim())
}

function formatAmount(value: string) {
  return formatUnits(BigInt(value), ARC_TESTNET_USDC_DECIMALS)
}

function statusLabel(status: SplitStatus | ParticipantStatus) {
  switch (status) {
    case "active":
      return "Active"
    case "completed":
      return "Complete"
    case "closed":
      return "Closed"
    case "cancelled":
      return "Cancelled"
    case "expired":
      return "Expired"
    case "pending":
      return "Pending"
    case "payment-processing":
      return "Payment processing"
    case "paid-in-app":
      return "Paid in CoinArc"
    case "paid-outside":
      return "Paid outside CoinArc"
    case "declined":
      return "Declined"
  }
}

function effectiveParticipantStatus(
  participant: SplitDetails["participants"][number],
  splitStatus: SplitStatus
) {
  if (participant.status === "pending") {
    if (splitStatus === "expired") return "Expired"
    if (splitStatus === "closed") return "Collection closed"
    if (splitStatus === "cancelled") return "Cancelled"
  }
  return statusLabel(participant.status)
}

function statusVariant(status: SplitStatus | ParticipantStatus) {
  if (status === "declined" || status === "cancelled") return "destructive"
  return "secondary"
}

function progressPercent(collected: string, total: string) {
  const denominator = BigInt(total)
  if (denominator === BigInt(0)) return 0
  return Math.min(
    100,
    Number((BigInt(collected) * BigInt(10000)) / denominator) / 100
  )
}

function ParticipantPicker({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean
  onChange: (participants: CoinArcRecipient[]) => void
  value: CoinArcRecipient[]
}) {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const normalizedQuery = query.trim()
  const search = useQuery(
    searchFriends,
    isAuthenticated && normalizedQuery.length >= 2 && value.length < 20
      ? { query: normalizedQuery }
      : "skip"
  )
  const candidates = (search ?? []).filter(
    (friend) =>
      !value.some((participant) => participant.userId === friend.userId)
  )
  const panelOpen = open && normalizedQuery.length >= 2 && value.length < 20

  function addParticipant(friend: CoinArcRecipient) {
    if (value.length >= 20) return
    onChange([...value, friend])
    setQuery("")
    setOpen(false)
  }

  return (
    <div className="space-y-3">
      {value.length > 0 ? (
        <div className="space-y-2">
          {value.map((participant) => (
            <div
              className="flex items-center gap-3 rounded-2xl border p-3"
              key={participant.userId}
            >
              <Avatar>
                {participant.avatarUrl ? (
                  <AvatarImage alt="" src={participant.avatarUrl} />
                ) : null}
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {initials(participant.displayName)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {participant.displayName}
                </span>
                <span className="block truncate text-sm text-muted-foreground">
                  @{participant.username}
                </span>
              </span>
              <Button
                aria-label={`Remove ${participant.displayName}`}
                disabled={disabled}
                onClick={() =>
                  onChange(
                    value.filter((entry) => entry.userId !== participant.userId)
                  )
                }
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      <Combobox
        autoHighlight
        disabled={disabled || value.length >= 20}
        filter={null}
        inputValue={query}
        items={candidates}
        itemToStringLabel={(friend: CoinArcRecipient) =>
          `${friend.displayName} @${friend.username}`
        }
        onInputValueChange={(nextQuery) => {
          setQuery(nextQuery)
          setOpen(nextQuery.trim().length >= 2)
        }}
        onOpenChange={(nextOpen) =>
          setOpen(nextOpen && normalizedQuery.length >= 2)
        }
        onValueChange={(friend) => {
          if (friend) addParticipant(friend as CoinArcRecipient)
        }}
        open={panelOpen}
        value={null}
      >
        <ComboboxInput
          aria-describedby="split-participants-help"
          autoComplete="off"
          placeholder={
            value.length >= 20
              ? "Maximum of 20 friends"
              : "Friend name or @username"
          }
          showTrigger={false}
        />
        <p className="sr-only" id="split-participants-help">
          Search and add up to 20 current CoinArc friends.
        </p>
        {panelOpen ? (
          <div
            aria-busy={search === undefined || isLoading || undefined}
            className="mt-2 overflow-hidden rounded-2xl border bg-popover"
          >
            {search === undefined || isLoading ? (
              <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                Searching friends...
              </p>
            ) : candidates.length > 0 ? (
              <ComboboxList>
                {(friend: CoinArcRecipient) => (
                  <ComboboxItem key={friend.userId} value={friend}>
                    <Avatar>
                      {friend.avatarUrl ? (
                        <AvatarImage alt="" src={friend.avatarUrl} />
                      ) : null}
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {initials(friend.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {friend.displayName}
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">
                        @{friend.username}
                      </span>
                    </span>
                  </ComboboxItem>
                )}
              </ComboboxList>
            ) : (
              <p className="px-3 py-3 text-sm text-muted-foreground">
                No other friends match this search.
              </p>
            )}
          </div>
        ) : null}
      </Combobox>
      <p className="text-xs text-muted-foreground">
        {value.length}/20 friends selected. Only current CoinArc friends can
        join a split.
      </p>
    </div>
  )
}

export function SplitDrawer({
  onBackToHistory,
  onOpenChange,
  onOpenSplit,
  onPayContribution,
  open,
  splitId,
}: {
  onBackToHistory: () => void
  onOpenChange: (open: boolean) => void
  onOpenSplit: (splitId: string) => void
  onPayContribution: (fulfillment: SplitFulfillment) => void
  open: boolean
  splitId: string | null
}) {
  const { isAuthenticated } = useConvexAuth()
  const create = useMutation(createSplit)
  const decline = useMutation(declineSplit)
  const remind = useMutation(remindParticipant)
  const recordPaidOutside = useMutation(markPaidOutside)
  const extend = useMutation(extendDeadline)
  const close = useMutation(closeSplit)
  const cancel = useMutation(cancelSplit)
  const [tab, setTab] = useState<"new" | "history">("new")
  const [historyRole, setHistoryRole] = useState<"collecting" | "contributing">(
    "collecting"
  )
  const [historyFilter, setHistoryFilter] = useState<"active" | "past">(
    "active"
  )
  const [view, setView] = useState<"form" | "review">("form")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [emoji, setEmoji] = useState<string>()
  const [total, setTotal] = useState("")
  const [splitMode, setSplitMode] = useState<"equal" | "custom">("equal")
  const [includeCreatorShare, setIncludeCreatorShare] = useState(true)
  const [creatorShare, setCreatorShare] = useState("0")
  const [participants, setParticipants] = useState<CoinArcRecipient[]>([])
  const [customShares, setCustomShares] = useState<Record<string, string>>({})
  const [hasDeadline, setHasDeadline] = useState(true)
  const [expiresInDays, setExpiresInDays] = useState("7")
  const [extendDays, setExtendDays] = useState("7")
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()

  const collectingHistory = usePaginatedQuery(
    listHistory,
    isAuthenticated ? { role: "collecting" } : "skip",
    { initialNumItems: 20 }
  )
  const contributingHistory = usePaginatedQuery(
    listHistory,
    isAuthenticated ? { role: "contributing" } : "skip",
    { initialNumItems: 20 }
  )
  const detail = useQuery(
    splitDetails,
    splitId && isAuthenticated ? { splitId } : "skip"
  )
  const totalBaseUnits = useMemo(() => amountToBaseUnits(total), [total])
  const totalIncomplete = isIncompleteAmount(total)
  const customCreatorShare = useMemo(
    () => amountToBaseUnits(creatorShare, true),
    [creatorShare]
  )
  const deadlineDays = Number(expiresInDays)
  const validDeadline =
    !hasDeadline ||
    (Number.isInteger(deadlineDays) && deadlineDays >= 1 && deadlineDays <= 365)

  const equalShares = useMemo(() => {
    if (!totalBaseUnits || participants.length === 0) return null
    const count = BigInt(participants.length + (includeCreatorShare ? 1 : 0))
    const base = totalBaseUnits / count
    const remainder = totalBaseUnits % count
    const values = Array.from(
      { length: Number(count) },
      (_, index) => base + (BigInt(index) < remainder ? BigInt(1) : BigInt(0))
    )
    return {
      creator: includeCreatorShare ? values[0] : BigInt(0),
      participants: participants.map((participant, index) => ({
        participantId: participant.userId,
        amount: values[index + (includeCreatorShare ? 1 : 0)],
      })),
    }
  }, [includeCreatorShare, participants, totalBaseUnits])

  const customParticipantShares = useMemo(
    () =>
      participants.map((participant) => ({
        participantId: participant.userId,
        amount: amountToBaseUnits(customShares[participant.userId] ?? ""),
      })),
    [customShares, participants]
  )
  const customAssigned = useMemo(() => {
    if (
      customCreatorShare === null ||
      customParticipantShares.some((share) => !share.amount)
    ) {
      return null
    }
    return customParticipantShares.reduce(
      (sum, share) => sum + share.amount!,
      customCreatorShare
    )
  }, [customCreatorShare, customParticipantShares])
  const customMatchesTotal =
    totalBaseUnits !== null &&
    customAssigned !== null &&
    customAssigned === totalBaseUnits
  const canReview =
    title.trim().length > 0 &&
    title.trim().length <= 80 &&
    participants.length >= 2 &&
    totalBaseUnits !== null &&
    validDeadline &&
    (splitMode === "equal" ? Boolean(equalShares) : customMatchesTotal)

  const activeDetailId = splitId
  const activeView = activeDetailId ? "detail" : view
  const historyQuery =
    historyRole === "collecting" ? collectingHistory : contributingHistory
  const history = historyQuery.results.filter((split) =>
    historyFilter === "active"
      ? split.status === "active"
      : split.status !== "active"
  )
  const historyLoading = historyQuery.status === "LoadingFirstPage"
  const historyLoadingMore = historyQuery.status === "LoadingMore"
  const canLoadMoreHistory = historyQuery.status === "CanLoadMore"

  function updateParticipants(nextParticipants: CoinArcRecipient[]) {
    setParticipants(nextParticipants)
    setCustomShares((current) => {
      const next: Record<string, string> = {}
      for (const participant of nextParticipants) {
        next[participant.userId] = current[participant.userId] ?? ""
      }
      return next
    })
  }

  function resetForm() {
    setView("form")
    setTitle("")
    setDescription("")
    setEmoji(undefined)
    setTotal("")
    setSplitMode("equal")
    setIncludeCreatorShare(true)
    setCreatorShare("0")
    setParticipants([])
    setCustomShares({})
    setHasDeadline(true)
    setExpiresInDays("7")
    setError(undefined)
  }

  function returnToHistory() {
    setTab("history")
    setView("form")
    setError(undefined)
    if (splitId) onBackToHistory()
  }

  function closeDrawer() {
    if (busy) return
    if (splitId) {
      onBackToHistory()
      return
    }
    setError(undefined)
    onOpenChange(false)
  }

  async function createCurrentSplit() {
    if (!canReview || !totalBaseUnits || busy) return
    setBusy("create")
    setError(undefined)
    try {
      const customSharesPayload =
        splitMode === "custom"
          ? customParticipantShares.map((share) => ({
              participantId: share.participantId,
              amountBaseUnits: share.amount!.toString(),
            }))
          : undefined
      const created = await create({
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(emoji ? { emoji } : {}),
        totalAmountBaseUnits: totalBaseUnits.toString(),
        includeCreatorShare,
        ...(splitMode === "custom" && customCreatorShare !== null
          ? { creatorShareBaseUnits: customCreatorShare.toString() }
          : {}),
        splitMode,
        participantIds: participants.map((participant) => participant.userId),
        ...(customSharesPayload ? { customShares: customSharesPayload } : {}),
        ...(hasDeadline ? { expiresInDays: deadlineDays } : {}),
        clientRequestId: crypto.randomUUID(),
      })
      resetForm()
      setTab("history")
      onOpenSplit(created.splitId)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not create this split. Please try again."
      )
    } finally {
      setBusy(undefined)
    }
  }

  async function runAction(key: string, action: () => Promise<unknown>) {
    if (busy) return
    setBusy(key)
    setError(undefined)
    try {
      await action()
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update this split. Please try again."
      )
    } finally {
      setBusy(undefined)
    }
  }

  function payContribution() {
    if (!detail?.ownParticipantId || !detail.creator || !detail.participants)
      return
    const participant = detail.participants.find(
      (entry) => entry.id === detail.ownParticipantId
    )
    if (!participant || participant.status !== "pending") return
    onPayContribution({
      splitParticipantId: participant.id,
      splitId: detail.id,
      title: detail.title,
      recipient: {
        userId: detail.creatorId,
        displayName: detail.creator.displayName,
        username: detail.creator.username,
        avatarUrl: detail.creator.avatarUrl,
        walletAddress: detail.collectorWalletAddress,
        isFriend: true,
      },
      amountBaseUnits: participant.amountBaseUnits,
    })
  }

  const currentParticipant = detail?.participants.find(
    (participant) => participant.id === detail.ownParticipantId
  )
  const collecting = detail ? BigInt(detail.collectedBaseUnits) : BigInt(0)
  const canCancel = detail ? collecting === BigInt(0) : false

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
              disabled={busy !== undefined}
              onClick={returnToHistory}
              type="button"
              variant="ghost"
            >
              <ArrowLeft />
              Split history
            </Button>
          ) : null}
          <DrawerTitle>
            {activeView === "detail" ? "Split bill" : "Split a bill"}
          </DrawerTitle>
          <DrawerDescription>
            {activeView === "detail"
              ? "Track contributions without changing anyone's assigned share."
              : "Collect fixed USDC contributions from friends in CoinArc."}
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          {activeView === "detail" ? (
            detail === undefined ? (
              <p className="py-8 text-sm text-muted-foreground">
                Loading split details...
              </p>
            ) : detail ? (
              <SplitDetail
                busy={busy}
                canCancel={canCancel}
                detail={detail}
                extendDays={extendDays}
                onChangeExtendDays={setExtendDays}
                onClose={() =>
                  void runAction("close", () => close({ splitId: detail.id }))
                }
                onCancel={() =>
                  void runAction("cancel", () => cancel({ splitId: detail.id }))
                }
                onDecline={() =>
                  currentParticipant
                    ? void runAction("decline", () =>
                        decline({ splitParticipantId: currentParticipant.id })
                      )
                    : undefined
                }
                onExtend={() =>
                  void runAction("extend", () =>
                    extend({
                      splitId: detail.id,
                      expiresInDays: Number(extendDays),
                    })
                  )
                }
                onMarkOutside={(participantId) =>
                  void runAction(`outside:${participantId}`, () =>
                    recordPaidOutside({ splitParticipantId: participantId })
                  )
                }
                onPay={payContribution}
                onRemind={(participantId) =>
                  void runAction(`remind:${participantId}`, () =>
                    remind({ splitParticipantId: participantId })
                  )
                }
              />
            ) : (
              <Empty className="min-h-56 border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UsersRound />
                  </EmptyMedia>
                  <EmptyTitle>Split unavailable</EmptyTitle>
                  <EmptyDescription>
                    This split may no longer be available to your CoinArc
                    account.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )
          ) : (
            <Tabs
              onValueChange={(nextTab) => {
                setTab(nextTab as "new" | "history")
                if (nextTab === "new") resetForm()
              }}
              value={tab}
            >
              <TabsList className="w-full">
                <TabsTrigger value="new">New split</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>

              <TabsContent className="pt-5" value="new">
                {view === "review" ? (
                  <SplitReview
                    creatorShare={
                      splitMode === "equal"
                        ? (equalShares?.creator ?? BigInt(0))
                        : (customCreatorShare ?? BigInt(0))
                    }
                    description={description}
                    emoji={emoji}
                    expiresInDays={hasDeadline ? deadlineDays : undefined}
                    onEdit={() => setView("form")}
                    participants={participants}
                    shares={
                      splitMode === "equal"
                        ? (equalShares?.participants ?? [])
                        : customParticipantShares.map((share) => ({
                            participantId: share.participantId,
                            amount: share.amount ?? BigInt(0),
                          }))
                    }
                    title={title}
                    total={totalBaseUnits ?? BigInt(0)}
                  />
                ) : (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="split-title">
                        What are you splitting?
                      </Label>
                      <Input
                        disabled={busy !== undefined}
                        id="split-title"
                        maxLength={80}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Dinner at Lantern"
                        value={title}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Emoji (optional)</Label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          aria-pressed={!emoji}
                          disabled={busy !== undefined}
                          onClick={() => setEmoji(undefined)}
                          size="sm"
                          type="button"
                          variant={!emoji ? "secondary" : "outline"}
                        >
                          None
                        </Button>
                        {emojiOptions.map((option) => (
                          <Button
                            aria-label={`Use ${option}`}
                            aria-pressed={emoji === option}
                            disabled={busy !== undefined}
                            key={option}
                            onClick={() => setEmoji(option)}
                            size="sm"
                            type="button"
                            variant={emoji === option ? "secondary" : "outline"}
                          >
                            {option}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="split-description">
                        Description (optional)
                      </Label>
                      <Textarea
                        disabled={busy !== undefined}
                        id="split-description"
                        maxLength={280}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="A shared note for everyone in this split."
                        value={description}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="split-participants">
                        Friends contributing
                      </Label>
                      <ParticipantPicker
                        disabled={busy !== undefined}
                        onChange={updateParticipants}
                        value={participants}
                      />
                      {participants.length > 0 && participants.length < 2 ? (
                        <p className="text-xs text-destructive">
                          Choose at least two friends. Use Request payment for
                          one person.
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="split-total">Expense total</Label>
                      <div className="relative">
                        <Input
                          className="pr-16"
                          disabled={busy !== undefined}
                          id="split-total"
                          inputMode="decimal"
                          onChange={(event) => setTotal(event.target.value)}
                          placeholder="0.00"
                          value={total}
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-muted-foreground">
                          USDC
                        </span>
                      </div>
                      {total && !totalBaseUnits && !totalIncomplete ? (
                        <p className="text-xs text-destructive">
                          Enter a positive amount with up to 6 decimal places.
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-3 rounded-3xl border p-4">
                      <div>
                        <Label>How should it be split?</Label>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Shares are fixed once the split is created.
                        </p>
                      </div>
                      <Tabs
                        onValueChange={(mode) =>
                          setSplitMode(mode as "equal" | "custom")
                        }
                        value={splitMode}
                      >
                        <TabsList className="w-full">
                          <TabsTrigger value="equal">Equal</TabsTrigger>
                          <TabsTrigger value="custom">Custom</TabsTrigger>
                        </TabsList>
                      </Tabs>
                      {splitMode === "equal" ? (
                        <div className="flex items-center justify-between gap-4">
                          <span>
                            <span className="block text-sm font-medium">
                              Include your share
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              You are not a participant, but your share is
                              included in the expense.
                            </span>
                          </span>
                          <Switch
                            checked={includeCreatorShare}
                            disabled={busy !== undefined}
                            onCheckedChange={setIncludeCreatorShare}
                          />
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <Label htmlFor="split-creator-share">
                              Your share
                            </Label>
                            <div className="relative">
                              <Input
                                className="pr-16"
                                disabled={busy !== undefined}
                                id="split-creator-share"
                                inputMode="decimal"
                                onChange={(event) =>
                                  setCreatorShare(event.target.value)
                                }
                                placeholder="0.00"
                                value={creatorShare}
                              />
                              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-muted-foreground">
                                USDC
                              </span>
                            </div>
                          </div>
                          {participants.map((participant) => (
                            <div className="space-y-2" key={participant.userId}>
                              <Label
                                htmlFor={`split-share-${participant.userId}`}
                              >
                                {participant.displayName}&apos;s share
                              </Label>
                              <div className="relative">
                                <Input
                                  className="pr-16"
                                  disabled={busy !== undefined}
                                  id={`split-share-${participant.userId}`}
                                  inputMode="decimal"
                                  onChange={(event) =>
                                    setCustomShares((current) => ({
                                      ...current,
                                      [participant.userId]: event.target.value,
                                    }))
                                  }
                                  placeholder="0.00"
                                  value={customShares[participant.userId] ?? ""}
                                />
                                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-muted-foreground">
                                  USDC
                                </span>
                              </div>
                            </div>
                          ))}
                          {totalBaseUnits && customAssigned !== null ? (
                            <p
                              className={`text-xs ${
                                customMatchesTotal
                                  ? "text-muted-foreground"
                                  : "text-destructive"
                              }`}
                            >
                              Assigned:{" "}
                              {formatUnits(
                                customAssigned,
                                ARC_TESTNET_USDC_DECIMALS
                              )}{" "}
                              of{" "}
                              {formatUnits(
                                totalBaseUnits,
                                ARC_TESTNET_USDC_DECIMALS
                              )}{" "}
                              USDC
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>
                    <div className="space-y-3 rounded-3xl border p-4">
                      <div className="flex items-center justify-between gap-4">
                        <span>
                          <span className="block text-sm font-medium">
                            Set a deadline
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            Participants cannot start a new payment after it
                            expires.
                          </span>
                        </span>
                        <Switch
                          checked={hasDeadline}
                          disabled={busy !== undefined}
                          onCheckedChange={setHasDeadline}
                        />
                      </div>
                      {hasDeadline ? (
                        <div className="space-y-2">
                          <Label htmlFor="split-deadline">
                            Expires in days
                          </Label>
                          <Input
                            disabled={busy !== undefined}
                            id="split-deadline"
                            max="365"
                            min="1"
                            onChange={(event) =>
                              setExpiresInDays(event.target.value)
                            }
                            type="number"
                            value={expiresInDays}
                          />
                          {!validDeadline ? (
                            <p className="text-xs text-destructive">
                              Choose any whole number from 1 to 365 days.
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Defaults to 7 days. Choose no deadline for an
                              open-ended split.
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent className="pt-5" value="history">
                <Tabs
                  onValueChange={(role) =>
                    setHistoryRole(role as "collecting" | "contributing")
                  }
                  value={historyRole}
                >
                  <TabsList className="w-full">
                    <TabsTrigger value="collecting">Collecting</TabsTrigger>
                    <TabsTrigger value="contributing">Contributing</TabsTrigger>
                  </TabsList>
                </Tabs>
                <Tabs
                  onValueChange={(filter) =>
                    setHistoryFilter(filter as "active" | "past")
                  }
                  value={historyFilter}
                >
                  <TabsList className="mt-4">
                    <TabsTrigger value="active">Active</TabsTrigger>
                    <TabsTrigger value="past">Past</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="mt-4">
                  {historyLoading ? (
                    <p className="py-8 text-sm text-muted-foreground">
                      Loading split history...
                    </p>
                  ) : history.length === 0 ? (
                    <Empty className="min-h-56 border-dashed">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <UsersRound />
                        </EmptyMedia>
                        <EmptyTitle>No splits here yet</EmptyTitle>
                        <EmptyDescription>
                          {historyRole === "collecting"
                            ? "Splits you create will appear here."
                            : "Splits your friends invite you to will appear here."}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <div className="divide-y overflow-hidden rounded-3xl border">
                      {history.map((split) => (
                        <SplitHistoryRow
                          key={split.id}
                          onClick={() => onOpenSplit(split.id)}
                          split={split}
                        />
                      ))}
                    </div>
                  )}
                  {canLoadMoreHistory || historyLoadingMore ? (
                    <Button
                      className="mt-4 w-full"
                      disabled={historyLoadingMore}
                      onClick={() => historyQuery.loadMore(20)}
                      type="button"
                      variant="outline"
                    >
                      {historyLoadingMore ? (
                        <LoaderCircle className="animate-spin" />
                      ) : null}
                      {historyLoadingMore ? "Loading splits..." : "Load more"}
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
          {activeView === "detail" ? (
            <Button
              disabled={busy !== undefined}
              onClick={closeDrawer}
              type="button"
              variant="outline"
            >
              Back to history
            </Button>
          ) : tab === "new" ? (
            view === "review" ? (
              <>
                <Button
                  disabled={!canReview || busy !== undefined}
                  onClick={() => void createCurrentSplit()}
                  type="button"
                >
                  {busy === "create" ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Send />
                  )}
                  {busy === "create" ? "Creating split..." : "Create split"}
                </Button>
                <Button
                  disabled={busy !== undefined}
                  onClick={() => setView("form")}
                  type="button"
                  variant="outline"
                >
                  Edit split
                </Button>
              </>
            ) : (
              <Button
                disabled={!canReview || busy !== undefined}
                onClick={() => {
                  if (!canReview) {
                    setError(
                      "Add at least two friends and complete the split details."
                    )
                    return
                  }
                  setError(undefined)
                  setView("review")
                }}
                type="button"
              >
                Review split
                <ChevronRight />
              </Button>
            )
          ) : null}
          {activeView !== "detail" ? (
            <Button
              disabled={busy !== undefined}
              onClick={closeDrawer}
              type="button"
              variant="outline"
            >
              Close
            </Button>
          ) : null}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function SplitReview({
  creatorShare,
  description,
  emoji,
  expiresInDays,
  onEdit,
  participants,
  shares,
  title,
  total,
}: {
  creatorShare: bigint
  description: string
  emoji?: string
  expiresInDays?: number
  onEdit: () => void
  participants: CoinArcRecipient[]
  shares: { participantId: string; amount: bigint }[]
  title: string
  total: bigint
}) {
  const collectionTarget = shares.reduce(
    (sum, share) => sum + share.amount,
    BigInt(0)
  )
  return (
    <div className="space-y-5">
      <Button className="-ml-3" onClick={onEdit} type="button" variant="ghost">
        <ArrowLeft />
        Edit split
      </Button>
      <div className="rounded-3xl border bg-muted/40 p-5">
        <p className="text-sm text-muted-foreground">Expense total</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight">
          {formatUnits(total, ARC_TESTNET_USDC_DECIMALS)} USDC
        </p>
        <p className="mt-3 font-medium">
          {emoji ? `${emoji} ` : ""}
          {title.trim()}
        </p>
        <div className="mt-5 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
          <span>
            <span className="block text-muted-foreground">Your share</span>
            <span className="font-medium">
              {formatUnits(creatorShare, ARC_TESTNET_USDC_DECIMALS)} USDC
            </span>
          </span>
          <span>
            <span className="block text-muted-foreground">
              Collection target
            </span>
            <span className="font-medium">
              {formatUnits(collectionTarget, ARC_TESTNET_USDC_DECIMALS)} USDC
            </span>
          </span>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Contribution preview</p>
        <div className="divide-y overflow-hidden rounded-3xl border">
          {participants.map((participant) => {
            const amount = shares.find(
              (share) => share.participantId === participant.userId
            )?.amount
            return (
              <div
                className="flex items-center gap-3 px-4 py-3"
                key={participant.userId}
              >
                <Avatar>
                  {participant.avatarUrl ? (
                    <AvatarImage alt="" src={participant.avatarUrl} />
                  ) : null}
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {initials(participant.displayName)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {participant.displayName}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    @{participant.username}
                  </span>
                </span>
                <span className="font-medium tabular-nums">
                  {formatUnits(amount ?? BigInt(0), ARC_TESTNET_USDC_DECIMALS)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      {description.trim() ? (
        <div className="rounded-2xl border p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Shared description
          </p>
          <p className="mt-1 text-sm whitespace-pre-wrap">
            {description.trim()}
          </p>
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">
        {expiresInDays
          ? `Contributions are due ${expiresInDays} days after this split is created.`
          : "This split has no deadline."}
      </p>
    </div>
  )
}

function SplitHistoryRow({
  onClick,
  split,
}: {
  onClick: () => void
  split: SplitSummary
}) {
  const collected = formatAmount(split.collectedBaseUnits)
  const target = formatAmount(split.collectionTargetBaseUnits)
  const title = `${split.emoji ? `${split.emoji} ` : ""}${split.title}`
  return (
    <Button
      className="h-auto w-full justify-start rounded-none px-4 py-3 text-left hover:bg-muted"
      onClick={onClick}
      type="button"
      variant="ghost"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <UsersRound className="size-5" />
      </span>
      <span className="ml-3 min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block text-sm text-muted-foreground">
          {statusLabel(split.status)} ·{" "}
          {formatDistanceToNow(new Date(split.createdAt), { addSuffix: true })}
        </span>
      </span>
      <span className="ml-3 text-right font-medium tabular-nums">
        {split.role === "collecting"
          ? `${collected}/${target}`
          : split.ownAmountBaseUnits
            ? formatAmount(split.ownAmountBaseUnits)
            : target}
      </span>
    </Button>
  )
}

function SplitDetail({
  busy,
  canCancel,
  detail,
  extendDays,
  onCancel,
  onChangeExtendDays,
  onClose,
  onDecline,
  onExtend,
  onMarkOutside,
  onPay,
  onRemind,
}: {
  busy?: string
  canCancel: boolean
  detail: SplitDetails
  extendDays: string
  onCancel: () => void
  onChangeExtendDays: (value: string) => void
  onClose: () => void
  onDecline: () => void
  onExtend: () => void
  onMarkOutside: (participantId: string) => void
  onPay: () => void
  onRemind: (participantId: string) => void
}) {
  const progress = progressPercent(
    detail.collectedBaseUnits,
    detail.collectionTargetBaseUnits
  )
  const ownParticipant = detail.participants.find(
    (participant) => participant.id === detail.ownParticipantId
  )
  const extendDaysNumber = Number(extendDays)
  const validExtendDays =
    Number.isInteger(extendDaysNumber) &&
    extendDaysNumber >= 1 &&
    extendDaysNumber <= 365
  const participantStatusTime = (
    participant: SplitDetails["participants"][number]
  ) =>
    participant.paidAt ??
    participant.paidOutsideAt ??
    participant.declinedAt ??
    participant.cancelledAt ??
    participant.paymentStartedAt

  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-muted p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Split bill</p>
            <h2 className="mt-1 truncate text-2xl font-semibold tracking-tight">
              {detail.emoji ? `${detail.emoji} ` : ""}
              {detail.title}
            </h2>
          </div>
          <Badge variant={statusVariant(detail.status)}>
            {statusLabel(detail.status)}
          </Badge>
        </div>
        <div className="mt-5">
          <div className="flex items-end justify-between gap-3">
            <span>
              <span className="block text-sm text-muted-foreground">
                Collected
              </span>
              <span className="text-2xl font-semibold tabular-nums">
                {formatAmount(detail.collectedBaseUnits)}{" "}
                <span className="text-base">USDC</span>
              </span>
            </span>
            <span className="text-right text-sm text-muted-foreground">
              of {formatAmount(detail.collectionTargetBaseUnits)} USDC
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {formatAmount(
              (
                BigInt(detail.collectionTargetBaseUnits) -
                BigInt(detail.collectedBaseUnits)
              ).toString()
            )}{" "}
            USDC still outstanding
          </p>
        </div>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-2xl border p-4">
          <p className="text-xs text-muted-foreground">Expense total</p>
          <p className="mt-1 font-medium">
            {formatAmount(detail.totalAmountBaseUnits)} USDC
          </p>
        </div>
        <div className="rounded-2xl border p-4">
          <p className="text-xs text-muted-foreground">Your share</p>
          <p className="mt-1 font-medium">
            {detail.isCreator
              ? `${formatAmount(detail.creatorShareBaseUnits)} USDC`
              : ownParticipant
                ? `${formatAmount(ownParticipant.amountBaseUnits)} USDC`
                : "—"}
          </p>
        </div>
      </div>

      {detail.description ? (
        <div className="rounded-2xl border p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Shared description
          </p>
          <p className="mt-1 text-sm whitespace-pre-wrap">
            {detail.description}
          </p>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Avatar>
          {detail.creator?.avatarUrl ? (
            <AvatarImage alt="" src={detail.creator.avatarUrl} />
          ) : null}
          <AvatarFallback className="bg-primary text-primary-foreground">
            {detail.creator ? (
              initials(detail.creator.displayName)
            ) : (
              <UserRound />
            )}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted-foreground">
            {detail.isCreator ? "Collecting" : "Collected by"}
          </span>
          <span className="block truncate font-medium">
            {detail.isCreator
              ? "You"
              : (detail.creator?.displayName ?? "CoinArc friend")}
          </span>
          {!detail.isCreator && detail.creator ? (
            <span className="block truncate text-sm text-muted-foreground">
              @{detail.creator.username}
            </span>
          ) : null}
        </span>
      </div>

      <Separator />

      <dl className="space-y-3 text-sm">
        <div className="flex items-start justify-between gap-5">
          <dt className="text-muted-foreground">Created</dt>
          <dd className="text-right font-medium">
            {format(new Date(detail.createdAt), "MMM d, yyyy, h:mm a")}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-5">
          <dt className="text-muted-foreground">Deadline</dt>
          <dd className="text-right font-medium">
            {detail.expiresAt
              ? detail.status === "expired"
                ? "Expired"
                : format(new Date(detail.expiresAt), "MMM d, yyyy, h:mm a")
              : "No deadline"}
          </dd>
        </div>
      </dl>

      {detail.isCreator ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Contributions</p>
            <span className="text-xs text-muted-foreground">
              {detail.participants.length} participants
            </span>
          </div>
          <div className="divide-y overflow-hidden rounded-3xl border">
            {detail.participants.map((participant) => {
              const updatedAt = participantStatusTime(participant)
              const canRemind =
                detail.status === "active" && participant.status === "pending"
              const canRecordOutside =
                detail.status === "active" &&
                (participant.status === "pending" ||
                  participant.status === "declined")
              return (
                <div className="p-4" key={participant.id}>
                  <div className="flex items-center gap-3">
                    <Avatar>
                      {participant.profile?.avatarUrl ? (
                        <AvatarImage
                          alt=""
                          src={participant.profile.avatarUrl}
                        />
                      ) : null}
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {participant.profile ? (
                          initials(participant.profile.displayName)
                        ) : (
                          <UserRound />
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {participant.profile?.displayName ?? "CoinArc friend"}
                      </span>
                      <span className="block text-sm text-muted-foreground">
                        {effectiveParticipantStatus(participant, detail.status)}
                        {updatedAt
                          ? ` · ${formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}`
                          : ""}
                      </span>
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatAmount(participant.amountBaseUnits)}
                    </span>
                  </div>
                  {canRemind || canRecordOutside ? (
                    <div className="mt-3 flex flex-wrap gap-2 pl-12">
                      {canRemind ? (
                        <Button
                          disabled={busy !== undefined}
                          onClick={() => onRemind(participant.id)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {busy === `remind:${participant.id}` ? (
                            <LoaderCircle className="animate-spin" />
                          ) : (
                            <Bell />
                          )}
                          Remind
                        </Button>
                      ) : null}
                      {canRecordOutside ? (
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <Button
                                disabled={busy !== undefined}
                                size="sm"
                                type="button"
                                variant="outline"
                              />
                            }
                          >
                            <Check />
                            Record outside CoinArc
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Record an outside payment?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This records{" "}
                                {formatAmount(participant.amountBaseUnits)} USDC
                                as received outside CoinArc. It does not move
                                money, and{" "}
                                {participant.profile?.displayName ??
                                  "this participant"}{" "}
                                will be notified.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => onMarkOutside(participant.id)}
                              >
                                Record payment
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          {detail.status === "active" || detail.status === "expired" ? (
            <div className="rounded-3xl border p-4">
              <p className="text-sm font-medium">Extend deadline</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pending participants will be notified of the new deadline.
              </p>
              <div className="mt-3 flex gap-2">
                <Input
                  aria-label="New deadline in days"
                  disabled={busy !== undefined}
                  max="365"
                  min="1"
                  onChange={(event) => onChangeExtendDays(event.target.value)}
                  type="number"
                  value={extendDays}
                />
                <Button
                  disabled={busy !== undefined || !validExtendDays}
                  onClick={onExtend}
                  type="button"
                  variant="outline"
                >
                  Extend
                </Button>
              </div>
            </div>
          ) : null}

          {detail.status === "active" ? (
            <div className="flex flex-wrap gap-2">
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      disabled={busy !== undefined}
                      type="button"
                      variant="outline"
                    />
                  }
                >
                  Close collection
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Close this split?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Pending participants will no longer be able to pay in
                      CoinArc. Contributions already made are not reversed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep collection open</AlertDialogCancel>
                    <AlertDialogAction onClick={onClose}>
                      Close collection
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              {canCancel ? (
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        disabled={busy !== undefined}
                        type="button"
                        variant="outline"
                      />
                    }
                  >
                    Cancel split
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel this split?</AlertDialogTitle>
                      <AlertDialogDescription>
                        No money has been recorded, so all pending invitations
                        will be cancelled.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep split</AlertDialogCancel>
                      <AlertDialogAction onClick={onCancel}>
                        Cancel split
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : ownParticipant ? (
        <div className="space-y-3 rounded-3xl border p-4">
          <div className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm text-muted-foreground">
                Your contribution
              </span>
              <span className="text-xl font-semibold">
                {formatAmount(ownParticipant.amountBaseUnits)} USDC
              </span>
            </span>
            <Badge variant={statusVariant(ownParticipant.status)}>
              {effectiveParticipantStatus(ownParticipant, detail.status)}
            </Badge>
          </div>
          {detail.status === "active" && ownParticipant.status === "pending" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy !== undefined || !detail.creator}
                onClick={onPay}
                type="button"
              >
                <CircleDollarSign />
                Pay your share
              </Button>
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      disabled={busy !== undefined}
                      type="button"
                      variant="outline"
                    />
                  }
                >
                  <UserRoundX />
                  Decline
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Decline this contribution?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Your assigned amount will stay fixed, but the creator will
                      be told that you declined. Ask them if circumstances
                      change.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep contribution</AlertDialogCancel>
                    <AlertDialogAction onClick={onDecline}>
                      Decline contribution
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : ownParticipant.status === "payment-processing" ? (
            <p className="text-sm text-muted-foreground">
              Your payment has started and is being confirmed on Arc Testnet.
            </p>
          ) : ownParticipant.status === "paid-outside" ? (
            <p className="text-sm text-muted-foreground">
              The creator recorded this contribution as paid outside CoinArc.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

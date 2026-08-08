"use client"

import Link from "next/link"
import {
  CalendarClock,
  CircleDollarSign,
  HandCoins,
  Link2,
  MoreHorizontal,
  ReceiptText,
  Repeat2,
  Send,
  UsersRound,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState, useSyncExternalStore } from "react"
import { useConvexAuth, useQuery } from "convex/react"
import { makeFunctionReference } from "convex/server"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ActivityFeed } from "@/components/activity/activity-feed"
import { PayDrawer } from "@/components/payments/pay-drawer"
import { PaymentDetailDialog } from "@/components/payments/payment-detail-dialog"
import {
  RequestDrawer,
  type RequestFulfillment,
} from "@/components/payments/request-drawer"
import {
  SplitDrawer,
  type SplitFulfillment,
} from "@/components/splits/split-drawer"
import { ReceiveDialog } from "@/components/payments/receive-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type FriendProfile = {
  avatarUrl?: string
  displayName: string
  username: string
}

type FriendsData = {
  friends: FriendProfile[]
}

type BalanceData = {
  amount: string | null
  balanceAvailable: boolean
  walletAvailable: boolean
}

type CoreActionId = "send" | "receive" | "split"
type AdditionalActionId =
  | "payment-link"
  | "claim-link"
  | "schedule-payment"
  | "recurring-payment"
  | "request-payment"
type ActionId = CoreActionId | AdditionalActionId

type Action = {
  description: string
  icon: typeof Send
  id: ActionId
  label: string
  title: string
}

type AdditionalAction = Action & { id: AdditionalActionId }

const listFriends = makeFunctionReference<
  "query",
  Record<string, never>,
  FriendsData
>("friends:list")

const coreActions: Action[] = [
  {
    id: "send",
    label: "Send",
    title: "Send money",
    description: "Send USDC to someone in your CoinArc network.",
    icon: Send,
  },
  {
    id: "receive",
    label: "Receive",
    title: "Receive money",
    description: "Share the details people need to pay you.",
    icon: HandCoins,
  },
  {
    id: "split",
    label: "Split",
    title: "Split a payment",
    description: "Set up an expense to share with friends or a group.",
    icon: UsersRound,
  },
]

const additionalActions: AdditionalAction[] = [
  {
    id: "payment-link",
    label: "Payment link",
    title: "Create a payment link",
    description: "Create a shareable link for a one-time payment.",
    icon: Link2,
  },
  {
    id: "claim-link",
    label: "Claim link",
    title: "Create a claim link",
    description: "Create a link for someone to claim a payment.",
    icon: CircleDollarSign,
  },
  {
    id: "schedule-payment",
    label: "Schedule payment",
    title: "Schedule a payment",
    description: "Choose a date for a payment to be sent later.",
    icon: CalendarClock,
  },
  {
    id: "recurring-payment",
    label: "Recurring payment",
    title: "Set up a recurring payment",
    description: "Create a payment that repeats on your preferred schedule.",
    icon: Repeat2,
  },
  {
    id: "request-payment",
    label: "Request",
    title: "Request a payment",
    description: "Ask someone to pay you a specific amount.",
    icon: ReceiptText,
  },
]

const emptySubscribe = () => () => {}

function initials(displayName: string) {
  return displayName
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function greetingForCurrentTime() {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

function useGreeting() {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )

  return mounted ? greetingForCurrentTime() : "Welcome back"
}

function ActionButton({
  action,
  featured = false,
  wide = false,
  onClick,
}: {
  action: Action
  featured?: boolean
  wide?: boolean
  onClick: () => void
}) {
  const Icon = action.icon

  return (
    <Button
      aria-label={action.title}
      className={
        featured
          ? `relative h-28 overflow-hidden rounded-3xl bg-primary px-4 text-primary-foreground shadow-sm hover:bg-primary/90 ${wide ? "col-span-2" : ""}`
          : "h-auto min-h-23 flex-col gap-2 rounded-3xl bg-primary px-2 py-3 text-primary-foreground shadow-sm hover:bg-primary/90"
      }
      onClick={onClick}
      type="button"
    >
      <Icon
        aria-hidden="true"
        className={
          featured
            ? "absolute -right-3 -bottom-4 size-24 rotate-[-8deg] opacity-15"
            : "size-6"
        }
      />
      <span
        className={
          featured
            ? "relative z-10 max-w-32 text-center text-sm leading-tight font-semibold"
            : "max-w-full truncate text-xs font-medium sm:text-sm"
        }
      >
        {action.label}
      </span>
    </Button>
  )
}

function MoreActions({
  onOpenAction,
}: {
  onOpenAction: (action: Action) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Open more payment actions"
        className="flex min-h-23 flex-col items-center justify-center gap-2 rounded-3xl bg-primary px-2 py-3 text-primary-foreground shadow-sm transition-colors outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <MoreHorizontal className="size-6" />
        <span className="text-xs font-medium sm:text-sm">More</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>More ways to move money</DropdownMenuLabel>
          {additionalActions.map((action) => {
            const Icon = action.icon
            return (
              <DropdownMenuItem
                key={action.id}
                onClick={() => onOpenAction(action)}
              >
                <Icon />
                <span className="min-w-0 flex-1 truncate">{action.label}</span>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function WalletBalance() {
  const [balance, setBalance] = useState<BalanceData>()

  useEffect(() => {
    let controller: AbortController | undefined
    const refresh = () => {
      controller?.abort()
      controller = new AbortController()
      void fetch("/api/wallet/balance", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Could not load balance")
          return (await response.json()) as BalanceData
        })
        .then((data) => setBalance(data))
        .catch((reason: unknown) => {
          if (!(
            reason instanceof DOMException && reason.name === "AbortError"
          )) {
            setBalance({
              amount: null,
              balanceAvailable: false,
              walletAvailable: false,
            })
          }
        })
    }

    refresh()
    window.addEventListener("coinarc:payment-confirmed", refresh)
    window.addEventListener("coinarc:wallet-balance-refresh", refresh)
    return () => {
      controller?.abort()
      window.removeEventListener("coinarc:payment-confirmed", refresh)
      window.removeEventListener("coinarc:wallet-balance-refresh", refresh)
    }
  }, [])

  const balanceLabel = balance?.amount ? `${balance.amount} USDC` : "— USDC"
  const displayBalanceLabel = balance?.amount
    ? balanceLabel
    : String.fromCodePoint(0x2014) + " USDC"
  const detail =
    balance === undefined
      ? "Loading your Arc Testnet wallet"
      : balance.walletAvailable
        ? balance.balanceAvailable
          ? "Available on Arc Testnet"
          : "Could not refresh your wallet balance"
        : "Link a wallet to see your balance"

  return (
    <div className="mt-5">
      <p className="text-xs font-medium tracking-[0.16em] text-primary-foreground/60 uppercase">
        Total balance
      </p>
      <p className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
        {displayBalanceLabel}
      </p>
      <p className="mt-2 text-sm text-primary-foreground/70">{detail}</p>
    </div>
  )
}

function FriendsPanel({ data }: { data: FriendsData | undefined }) {
  if (data === undefined) {
    return (
      <p className="py-8 text-sm text-muted-foreground">Loading friends…</p>
    )
  }

  if (data.friends.length === 0) {
    return (
      <Empty className="min-h-60 border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersRound />
          </EmptyMedia>
          <EmptyTitle>Your circle starts here</EmptyTitle>
          <EmptyDescription>
            Add friends from the search button in the header, then send or split
            with them from CoinArc.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="space-y-2">
      {data.friends.slice(0, 8).map((friend) => (
        <Link
          className="flex items-center gap-3 rounded-3xl border p-3 transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
          href={`/profile/${friend.username}`}
          key={friend.username}
        >
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
          <span className="text-sm text-muted-foreground">View</span>
        </Link>
      ))}
      {data.friends.length > 8 ? (
        <Button
          className="w-full"
          render={<Link href="/friends" />}
          variant="outline"
        >
          View all friends
        </Button>
      ) : null}
    </div>
  )
}

export function HomeDashboard({
  displayName,
  receivingAddress,
}: {
  displayName: string
  receivingAddress?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated } = useConvexAuth()
  const friends = useQuery(listFriends, isAuthenticated ? {} : "skip")
  const [activeAction, setActiveAction] = useState<Action | null>(null)
  const greeting = useGreeting()
  const selectedPaymentId = searchParams.get("payment")
  const selectedRequestId = searchParams.get("request")
  const selectedSplitId = searchParams.get("split")
  const [requestFulfillment, setRequestFulfillment] =
    useState<RequestFulfillment | null>(null)
  const [splitFulfillment, setSplitFulfillment] =
    useState<SplitFulfillment | null>(null)
  const requestAction = additionalActions.find(
    (action) => action.id === "request-payment"
  )!
  const splitAction = coreActions.find((action) => action.id === "split")!
  const primaryActions = [coreActions[0], coreActions[1], requestAction]
  const secondaryActions = [
    splitAction,
    ...additionalActions.filter((action) => action.id !== "request-payment"),
  ]

  function openPayment(paymentId: string) {
    const next = new URLSearchParams(searchParams.toString())
    next.set("payment", paymentId)
    router.push(`/home?${next.toString()}`)
  }

  function closePaymentDetail(open: boolean) {
    if (open) return
    const next = new URLSearchParams(searchParams.toString())
    next.delete("payment")
    const query = next.toString()
    router.replace(query ? `/home?${query}` : "/home")
  }

  function openRequest(requestId: string) {
    const next = new URLSearchParams(searchParams.toString())
    next.set("request", requestId)
    router.push(`/home?${next.toString()}`)
  }

  function closeRequestDetail() {
    const next = new URLSearchParams(searchParams.toString())
    next.delete("request")
    const query = next.toString()
    router.replace(query ? `/home?${query}` : "/home")
  }

  function openSplit(splitId: string) {
    const next = new URLSearchParams(searchParams.toString())
    next.set("split", splitId)
    router.push(`/home?${next.toString()}`)
  }

  function closeSplitDetail() {
    const next = new URLSearchParams(searchParams.toString())
    next.delete("split")
    const query = next.toString()
    router.replace(query ? `/home?${query}` : "/home")
  }

  function returnToRequestDetails() {
    const requestId = requestFulfillment?.requestId
    setRequestFulfillment(null)
    if (requestId) openRequest(requestId)
  }

  function returnToSplitDetails() {
    const splitId = splitFulfillment?.splitId
    setSplitFulfillment(null)
    if (splitId) openSplit(splitId)
  }

  return (
    <main className="mx-auto min-h-[calc(100svh-4rem)] w-full max-w-2xl p-4 pb-10 sm:p-6">
      <div className="space-y-6">
        <Card className="relative overflow-hidden border-0 bg-primary text-primary-foreground shadow-lg">
          <CircleDollarSign className="pointer-events-none absolute -right-8 -bottom-12 size-48 rotate-12 opacity-[0.06]" />
          <CardContent className="relative p-6 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-primary-foreground/75">
                {greeting}, {displayName}
              </p>
              <span className="rounded-full bg-primary-foreground/10 px-3 py-1 text-[0.65rem] font-medium tracking-wider text-primary-foreground/75 uppercase ring-1 ring-primary-foreground/10">
                Arc Testnet
              </span>
            </div>
            <WalletBalance />
          </CardContent>
        </Card>

        <section aria-label="Payment actions" className="space-y-3">
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {primaryActions.map((action) => (
              <ActionButton
                action={action}
                key={action.id}
                onClick={() => setActiveAction(action)}
              />
            ))}
            <MoreActions onOpenAction={setActiveAction} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {secondaryActions.map((action, index) => (
              <ActionButton
                action={action}
                featured
                key={action.id}
                onClick={() => setActiveAction(action)}
                wide={index === secondaryActions.length - 1}
              />
            ))}
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Keep up with your circle</CardTitle>
            <CardDescription>
              See what is happening or visit the people you know.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="activity">
              <TabsList className="w-full">
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="friends">Friends</TabsTrigger>
              </TabsList>
              <TabsContent className="pt-4" value="activity">
                <ActivityFeed
                  onOpenPayment={openPayment}
                  onOpenRequest={openRequest}
                  onOpenSplit={openSplit}
                />
              </TabsContent>
              <TabsContent className="pt-4" value="friends">
                <FriendsPanel data={friends} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Drawer
        onOpenChange={(open) => {
          if (!open) setActiveAction(null)
        }}
        open={
          activeAction !== null &&
          activeAction.id !== "send" &&
          activeAction.id !== "receive" &&
          activeAction.id !== "request-payment" &&
          activeAction.id !== "split"
        }
        showSwipeHandle
      >
        <DrawerContent className="md:!mx-auto md:[--drawer-content-width:39rem]">
          {activeAction ? (
            <>
              <DrawerHeader>
                <DrawerTitle>{activeAction.title}</DrawerTitle>
                <DrawerDescription>
                  {activeAction.description}
                </DrawerDescription>
              </DrawerHeader>
              <div className="px-4 py-6">
                <div className="rounded-3xl border border-dashed bg-muted/50 p-5 text-sm text-muted-foreground">
                  This is the home action scaffold. The complete{" "}
                  {activeAction.label.toLowerCase()} flow will be added here
                  without changing how you reach it.
                </div>
              </div>
              <DrawerFooter>
                <Button
                  onClick={() => setActiveAction(null)}
                  type="button"
                  variant="outline"
                >
                  Close
                </Button>
              </DrawerFooter>
            </>
          ) : null}
        </DrawerContent>
      </Drawer>
      <PayDrawer
        key={
          requestFulfillment?.requestId ??
          splitFulfillment?.splitParticipantId ??
          "send"
        }
        onOpenChange={(open) => {
          if (!open) {
            setRequestFulfillment(null)
            setSplitFulfillment(null)
            setActiveAction(null)
          }
        }}
        onOpenPayment={openPayment}
        onReturnToRequest={returnToRequestDetails}
        onReturnToSplit={returnToSplitDetails}
        open={
          activeAction?.id === "send" ||
          requestFulfillment !== null ||
          splitFulfillment !== null
        }
        requestFulfillment={requestFulfillment}
        splitFulfillment={splitFulfillment}
      />
      <RequestDrawer
        onBackToHistory={() => {
          setActiveAction(requestAction)
          closeRequestDetail()
        }}
        onOpenChange={(open) => {
          if (!open) {
            setActiveAction(null)
            closeRequestDetail()
          }
        }}
        onPayRequest={(request) => setRequestFulfillment(request)}
        open={
          requestFulfillment === null &&
          (activeAction?.id === "request-payment" || selectedRequestId !== null)
        }
        requestId={selectedRequestId}
      />
      <SplitDrawer
        onBackToHistory={() => {
          setActiveAction(splitAction)
          closeSplitDetail()
        }}
        onOpenChange={(open) => {
          if (!open) {
            setActiveAction(null)
            closeSplitDetail()
          }
        }}
        onOpenSplit={openSplit}
        onPayContribution={(fulfillment) => setSplitFulfillment(fulfillment)}
        open={
          splitFulfillment === null &&
          (activeAction?.id === "split" || selectedSplitId !== null)
        }
        splitId={selectedSplitId}
      />
      <ReceiveDialog
        address={receivingAddress}
        onOpenChange={(open) => {
          if (!open) setActiveAction(null)
        }}
        open={activeAction?.id === "receive"}
      />
      <PaymentDetailDialog
        onOpenChange={closePaymentDetail}
        paymentId={selectedPaymentId}
      />
    </main>
  )
}

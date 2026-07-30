"use client"

import Link from "next/link"
import {
  CalendarClock,
  CircleDollarSign,
  HandCoins,
  Link2,
  MoreHorizontal,
  Pin,
  ReceiptText,
  Repeat2,
  Send,
  UsersRound,
  WalletCards,
} from "lucide-react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { useQuery } from "convex/react"
import { makeFunctionReference } from "convex/server"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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

type CoreActionId = "pay" | "receive" | "split"
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

const PINNED_ACTIONS_STORAGE_KEY = "coinarc.home.pinned-actions"

const coreActions: Action[] = [
  {
    id: "pay",
    label: "Pay",
    title: "Make a payment",
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
    label: "Request payment",
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
  onClick,
}: {
  action: Action
  onClick: () => void
}) {
  const Icon = action.icon

  return (
    <Button
      aria-label={action.title}
      className="h-auto min-h-23 flex-col gap-2 rounded-3xl bg-secondary px-2 py-3 text-secondary-foreground hover:bg-secondary/75"
      onClick={onClick}
      type="button"
      variant="secondary"
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-foreground/5">
        <Icon className="size-5" />
      </span>
      <span className="max-w-full truncate text-xs font-medium sm:text-sm">
        {action.label}
      </span>
    </Button>
  )
}

function MoreActions({
  onOpenAction,
  pinnedActionIds,
  onTogglePinned,
}: {
  onOpenAction: (action: Action) => void
  onTogglePinned: (actionId: AdditionalActionId) => void
  pinnedActionIds: Set<AdditionalActionId>
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Open more payment actions"
        className="flex min-h-23 flex-col items-center justify-center gap-2 rounded-3xl bg-secondary px-2 py-3 text-secondary-foreground transition-colors outline-none hover:bg-secondary/75 focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-foreground/5">
          <MoreHorizontal className="size-5" />
        </span>
        <span className="text-xs font-medium sm:text-sm">More</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
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
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Pin shortcuts below</DropdownMenuLabel>
        {additionalActions.map((action) => (
          <DropdownMenuCheckboxItem
            checked={pinnedActionIds.has(action.id)}
            key={action.id}
            onCheckedChange={() => onTogglePinned(action.id)}
          >
            <Pin />
            {action.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function WalletBalance() {
  const [balance, setBalance] = useState<BalanceData>()

  useEffect(() => {
    const controller = new AbortController()

    void fetch("/api/wallet/balance", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load balance")
        return (await response.json()) as BalanceData
      })
      .then((data) => setBalance(data))
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setBalance({
            amount: null,
            balanceAvailable: false,
            walletAvailable: false,
          })
        }
      })

    return () => controller.abort()
  }, [])

  const balanceLabel = balance?.amount ? `${balance.amount} USDC` : "â€” USDC"
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
    <div className="mt-7">
      <p className="text-sm text-primary-foreground/70">Total balance</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
        {displayBalanceLabel}
      </p>
      <p className="mt-2 text-sm text-primary-foreground/70">{detail}</p>
    </div>
  )
}

function ActivityPanel() {
  return (
    <Empty className="min-h-60 border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <WalletCards />
        </EmptyMedia>
        <EmptyTitle>No activity yet</EmptyTitle>
        <EmptyDescription>
          Payments, requests, and splits will appear here once they are
          available.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function FriendsPanel({ data }: { data: FriendsData | undefined }) {
  if (data === undefined) {
    return (
      <p className="py-8 text-sm text-muted-foreground">Loading friendsâ€¦</p>
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
            Add friends from the search button in the header, then pay or split
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

export function HomeDashboard({ displayName }: { displayName: string }) {
  const friends = useQuery(listFriends)
  const [activeAction, setActiveAction] = useState<Action | null>(null)
  const greeting = useGreeting()
  const [pinnedActionIds, setPinnedActionIds] = useState<
    Set<AdditionalActionId>
  >(new Set())

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PINNED_ACTIONS_STORAGE_KEY)
      if (!stored) return
      const parsed: unknown = JSON.parse(stored)
      if (!Array.isArray(parsed)) throw new Error("Invalid pinned actions")
      const validIds = new Set<AdditionalActionId>(
        parsed.filter(
          (id: unknown): id is AdditionalActionId =>
            typeof id === "string" &&
            additionalActions.some((action) => action.id === id)
        )
      )
      void Promise.resolve().then(() => {
        setPinnedActionIds(validIds)
      })
    } catch {
      window.localStorage.removeItem(PINNED_ACTIONS_STORAGE_KEY)
    }
  }, [])

  function togglePinned(actionId: AdditionalActionId) {
    const next = new Set(pinnedActionIds)
    if (next.has(actionId)) next.delete(actionId)
    else next.add(actionId)
    window.localStorage.setItem(
      PINNED_ACTIONS_STORAGE_KEY,
      JSON.stringify([...next])
    )
    setPinnedActionIds(next)
  }

  const pinnedActions = additionalActions.filter((action) =>
    pinnedActionIds.has(action.id)
  )

  return (
    <main className="mx-auto min-h-[calc(100svh-4rem)] w-full max-w-2xl p-4 pb-10 sm:p-6">
      <div className="space-y-6">
        <Card className="bg-primary text-primary-foreground shadow-lg">
          <CardContent className="pt-6">
            <p className="text-sm text-primary-foreground/70">
              {greeting}, {displayName}
            </p>
            <WalletBalance />
          </CardContent>
        </Card>

        <section aria-label="Payment actions" className="space-y-3">
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {coreActions.map((action) => (
              <ActionButton
                action={action}
                key={action.id}
                onClick={() => setActiveAction(action)}
              />
            ))}
            <MoreActions
              onOpenAction={setActiveAction}
              onTogglePinned={togglePinned}
              pinnedActionIds={pinnedActionIds}
            />
          </div>

          {pinnedActions.length > 0 ? (
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              {pinnedActions.map((action) => (
                <ActionButton
                  action={action}
                  key={action.id}
                  onClick={() => setActiveAction(action)}
                />
              ))}
            </div>
          ) : null}
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
                <ActivityPanel />
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
        open={activeAction !== null}
        showSwipeHandle
      >
        <DrawerContent>
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
    </main>
  )
}

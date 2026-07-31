"use client"

import { formatDistanceToNow } from "date-fns"
import {
  ArrowLeft,
  ChevronUp,
  MessageCircle,
  MoreHorizontal,
  PenLine,
  SendHorizontal,
  ShieldBan,
  SmilePlus,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import {
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react"
import {
  makeFunctionReference,
  type PaginationOptions,
  type PaginationResult,
} from "convex/server"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const REACTION_EMOJIS = ["👍", "❤️", "😂", "👀"] as const
type ReactionEmoji = (typeof REACTION_EMOJIS)[number]

type FriendProfile = {
  avatarUrl?: string
  displayName: string
  username: string
}

type FriendsData = {
  friends: FriendProfile[]
}

type InboxConversation = {
  conversationId: string
  participant: FriendProfile
  lastMessage: {
    body: string
    createdAt: number
    isOwn: boolean
  }
  unreadCount: number
}

type ConversationState =
  | { status: "unavailable" }
  | { status: "empty"; participant: FriendProfile }
  | {
      status: "active" | "archived"
      conversationId: string
      participant: FriendProfile
    }

type DirectMessage = {
  _id: string
  body: string
  createdAt: number
  isOwn: boolean
  viewerReaction: ReactionEmoji | null
  reactions: Array<{ emoji: ReactionEmoji; count: number }>
}

const listFriends = makeFunctionReference<
  "query",
  Record<string, never>,
  FriendsData
>("friends:list")
const listInbox = makeFunctionReference<
  "query",
  { archived: boolean },
  InboxConversation[]
>("directMessages:listInbox")
const conversationForUsername = makeFunctionReference<
  "query",
  { username: string },
  ConversationState
>("directMessages:conversationForUsername")
const listMessages = makeFunctionReference<
  "query",
  { conversationId: string; paginationOpts: PaginationOptions },
  PaginationResult<DirectMessage>
>("directMessages:listMessages")
const sendMessage = makeFunctionReference<
  "mutation",
  { username: string; body: string; clientMessageId: string },
  { messageId: string; conversationId: string }
>("directMessages:sendMessage")
const markConversationRead = makeFunctionReference<
  "mutation",
  { conversationId: string },
  null
>("directMessages:markConversationRead")
const setReaction = makeFunctionReference<
  "mutation",
  { messageId: string; emoji?: ReactionEmoji },
  null
>("directMessages:setReaction")
const unreadMessageCount = makeFunctionReference<
  "query",
  Record<string, never>,
  number
>("directMessages:unreadCount")
const blockUser = makeFunctionReference<
  "mutation",
  { username: string },
  { status: string }
>("friends:blockUser")

function initials(displayName: string) {
  return displayName
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function relativeTime(time: number) {
  return formatDistanceToNow(new Date(time), { addSuffix: true })
}

export function NewMessageButton({ className }: { className?: string }) {
  const router = useRouter()
  const friends = useQuery(listFriends, {})
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState("")

  const matchingFriends = useMemo(() => {
    const normalized = filter.trim().toLowerCase()
    if (!normalized) return friends?.friends ?? []
    return (friends?.friends ?? []).filter((friend) =>
      `${friend.displayName} ${friend.username}`.toLowerCase().includes(normalized)
    )
  }, [filter, friends?.friends])

  function openConversation(username: string) {
    setOpen(false)
    setFilter("")
    router.push(`/messages/${username}`)
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setFilter("")
      }}
      open={open}
    >
      <DialogTrigger
        render={<Button className={className} size="sm" type="button" />}
      >
        <PenLine />
        New message
      </DialogTrigger>
      <DialogContent className="max-h-[min(34rem,calc(100svh-2rem))] gap-4 overflow-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
          <DialogDescription>
            You can send direct messages to your friends on CoinArc.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Find a friend"
          type="search"
          value={filter}
        />
        <div className="min-h-0 overflow-y-auto pr-1">
          {friends === undefined ? (
            <p className="p-3 text-sm text-muted-foreground">
              Loading friends…
            </p>
          ) : matchingFriends.length === 0 ? (
            <Empty className="min-h-44 p-6">
              <EmptyHeader>
                <EmptyTitle>
                  {friends.friends.length === 0
                    ? "No friends to message"
                    : "No matching friends"}
                </EmptyTitle>
                <EmptyDescription>
                  {friends.friends.length === 0
                    ? "Add a friend first, then you can start a private conversation."
                    : "Try another name or username."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-1">
              {matchingFriends.map((friend) => (
                <button
                  className="flex w-full items-center gap-3 rounded-2xl p-3 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  key={friend.username}
                  onClick={() => openConversation(friend.username)}
                  type="button"
                >
                  <ProfileAvatar profile={friend} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {friend.displayName}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      @{friend.username}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ProfileAvatar({ profile }: { profile: FriendProfile }) {
  return (
    <Avatar>
      {profile.avatarUrl ? <AvatarImage alt="" src={profile.avatarUrl} /> : null}
      <AvatarFallback className="bg-primary text-primary-foreground">
        {initials(profile.displayName)}
      </AvatarFallback>
    </Avatar>
  )
}

function ConversationList({
  archived,
  selectedUsername,
}: {
  archived: boolean
  selectedUsername?: string
}) {
  const conversations = useQuery(listInbox, { archived })

  if (conversations === undefined) {
    return <p className="p-4 text-sm text-muted-foreground">Loading messages…</p>
  }

  if (conversations.length === 0) {
    return (
      <Empty className="min-h-56 border-0 p-6">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageCircle />
          </EmptyMedia>
          <EmptyTitle>
            {archived ? "No archived conversations" : "No messages yet"}
          </EmptyTitle>
          <EmptyDescription>
            {archived
              ? "Conversations are archived when a friendship ends or someone is blocked."
              : "Start a private conversation with one of your friends."}
          </EmptyDescription>
        </EmptyHeader>
        {!archived ? (
          <EmptyContent>
            <NewMessageButton />
          </EmptyContent>
        ) : null}
      </Empty>
    )
  }

  return (
    <div className="space-y-1 px-1 pb-2">
      {conversations.map((conversation) => {
        const isSelected = selectedUsername === conversation.participant.username
        return (
          <Link
            className={cn(
              "flex min-w-0 items-center gap-3 rounded-2xl p-3 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isSelected && "bg-muted"
            )}
            href={`/messages/${conversation.participant.username}`}
            key={conversation.conversationId}
          >
            <ProfileAvatar profile={conversation.participant} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {conversation.participant.displayName}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {relativeTime(conversation.lastMessage.createdAt)}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {conversation.lastMessage.isOwn ? "You: " : ""}
                  {conversation.lastMessage.body}
                </span>
                {!archived && conversation.unreadCount > 0 ? (
                  <span
                    aria-label={`${conversation.unreadCount} unread messages`}
                    className="flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold leading-5 text-primary-foreground"
                  >
                    {conversation.unreadCount > 99
                      ? "99+"
                      : conversation.unreadCount}
                  </span>
                ) : null}
              </span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}

export function MessagesInbox() {
  return (
    <main className="mx-auto min-h-[calc(100svh-4rem)] w-full max-w-2xl p-4 sm:p-6">
      <InboxPanel />
    </main>
  )
}

export function InboxPanel({
  className,
  selectedUsername,
}: {
  className?: string
  selectedUsername?: string
}) {
  return (
    <section className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex items-center justify-between gap-3 px-1 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Private conversations with your friends.
          </p>
        </div>
        <NewMessageButton />
      </div>
      <Tabs className="min-h-0 flex-1" defaultValue="inbox">
        <TabsList className="mb-3 w-full sm:w-fit">
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>
        <TabsContent className="min-h-0" value="inbox">
          <ConversationList selectedUsername={selectedUsername} archived={false} />
        </TabsContent>
        <TabsContent className="min-h-0" value="archived">
          <ConversationList selectedUsername={selectedUsername} archived />
        </TabsContent>
      </Tabs>
    </section>
  )
}

function ReactionPicker({
  message,
  disabled,
  onSelect,
}: {
  message: DirectMessage
  disabled: boolean
  onSelect: (emoji: ReactionEmoji) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Add reaction"
        disabled={disabled}
        render={<Button size="icon-xs" type="button" variant="ghost" />}
      >
        <SmilePlus />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-0">
        {REACTION_EMOJIS.map((emoji) => (
          <DropdownMenuItem key={emoji} onClick={() => onSelect(emoji)}>
            <span aria-hidden className="text-base leading-none">
              {emoji}
            </span>
            {message.viewerReaction === emoji ? "Remove reaction" : "React"}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MessageReactions({
  message,
  disabled,
  onSelect,
}: {
  message: DirectMessage
  disabled: boolean
  onSelect: (emoji: ReactionEmoji) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {message.reactions.map((reaction) => (
        <Button
          aria-label={`${reaction.emoji} reaction, ${reaction.count}`}
          className={cn(
            "h-6 min-w-6 gap-1 rounded-full px-1.5 text-xs",
            message.viewerReaction === reaction.emoji && "ring-1 ring-primary"
          )}
          disabled={disabled}
          key={reaction.emoji}
          onClick={() => onSelect(reaction.emoji)}
          size="xs"
          type="button"
          variant="secondary"
        >
          <span aria-hidden>{reaction.emoji}</span>
          <span>{reaction.count}</span>
        </Button>
      ))}
      <ReactionPicker disabled={disabled} message={message} onSelect={onSelect} />
    </div>
  )
}

function ConversationHistory({
  conversationId,
  participant,
  isArchived,
}: {
  conversationId?: string
  participant: FriendProfile
  isArchived: boolean
}) {
  const { loadMore, results, status } = usePaginatedQuery(
    listMessages,
    conversationId ? { conversationId } : "skip",
    { initialNumItems: 40 }
  )
  const markRead = useMutation(markConversationRead)
  const setMessageReaction = useMutation(setReaction)
  const [reactionError, setReactionError] = useState<string>()
  const messages = useMemo(
    () => [...results].sort((a, b) => a.createdAt - b.createdAt),
    [results]
  )

  useEffect(() => {
    if (!conversationId || isArchived || messages.length === 0) return
    void markRead({ conversationId })
  }, [conversationId, isArchived, markRead, messages.length])

  async function chooseReaction(message: DirectMessage, emoji: ReactionEmoji) {
    setReactionError(undefined)
    try {
      await setMessageReaction(
        message.viewerReaction === emoji
          ? { messageId: message._id }
          : { messageId: message._id, emoji }
      )
    } catch (reason) {
      setReactionError(
        reason instanceof Error
          ? reason.message
          : "Could not update your reaction. Please try again."
      )
    }
  }

  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller className="flex-1">
        <MessageScrollerViewport
          aria-label={`Conversation with ${participant.displayName}`}
          preserveScrollOnPrepend
        >
          <MessageScrollerContent className="gap-4 px-4 py-5 sm:px-6">
            {status === "CanLoadMore" || status === "LoadingMore" ? (
              <div className="flex justify-center">
                <Button
                  disabled={status === "LoadingMore"}
                  onClick={() => loadMore(40)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <ChevronUp />
                  {status === "LoadingMore" ? "Loading…" : "Load earlier"}
                </Button>
              </div>
            ) : null}
            {status === "LoadingFirstPage" ? (
              <p className="text-center text-sm text-muted-foreground">
                Loading conversation…
              </p>
            ) : null}
            {messages.map((message, index) => {
              const previous = messages[index - 1]
              const showName = !previous || previous.isOwn !== message.isOwn
              return (
                <MessageScrollerItem
                  key={message._id}
                  messageId={message._id}
                  scrollAnchor={index === messages.length - 1}
                >
                  <Message align={message.isOwn ? "end" : "start"}>
                    {!message.isOwn ? (
                      <MessageAvatar>
                        {showName ? <ProfileAvatar profile={participant} /> : null}
                      </MessageAvatar>
                    ) : null}
                    <MessageContent>
                      {showName ? (
                        <MessageHeader
                          className={cn(message.isOwn && "justify-end")}
                        >
                          {message.isOwn ? "You" : participant.displayName}
                        </MessageHeader>
                      ) : null}
                      <div
                        className={cn(
                          "max-w-[min(32rem,85%)] rounded-3xl px-3.5 py-2.5 text-sm leading-5 whitespace-pre-wrap",
                          message.isOwn
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        )}
                      >
                        {message.body}
                      </div>
                      <MessageFooter className="gap-2">
                        <span>{relativeTime(message.createdAt)}</span>
                        {!isArchived ? (
                          <MessageReactions
                            disabled={false}
                            message={message}
                            onSelect={(emoji) =>
                              void chooseReaction(message, emoji)
                            }
                          />
                        ) : null}
                      </MessageFooter>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              )
            })}
            {reactionError ? (
              <p className="text-center text-sm text-destructive" role="alert">
                {reactionError}
              </p>
            ) : null}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}

function Composer({
  username,
  participant,
}: {
  username: string
  participant: FriendProfile
}) {
  const send = useMutation(sendMessage)
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = body.trim()
    if (!message || busy) return

    setBusy(true)
    setError(undefined)
    try {
      await send({
        username,
        body: message,
        clientMessageId: crypto.randomUUID(),
      })
      setBody("")
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not send your message. Please try again."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="border-t bg-background p-3 sm:p-4" onSubmit={submit}>
      <label className="sr-only" htmlFor="message-body">
        Message {participant.displayName}
      </label>
      <div className="flex items-end gap-2">
        <Textarea
          disabled={busy}
          id="message-body"
          maxLength={2000}
          onChange={(event) => setBody(event.target.value)}
          placeholder={`Message ${participant.displayName}`}
          rows={1}
          value={body}
        />
        <Button
          aria-label="Send message"
          disabled={busy || !body.trim()}
          size="icon"
          type="submit"
        >
          <SendHorizontal />
        </Button>
      </div>
      <div className="mt-1 flex min-h-4 items-center justify-between gap-3 px-1">
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : (
          <span className="text-xs text-muted-foreground">Up to 2,000 characters</span>
        )}
        <span className="text-xs text-muted-foreground">{body.length}/2000</span>
      </div>
    </form>
  )
}

function ConversationHeader({
  participant,
  username,
  isArchived,
}: {
  participant: FriendProfile
  username: string
  isArchived: boolean
}) {
  const block = useMutation(blockUser)
  const [confirmingBlock, setConfirmingBlock] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function confirmBlock() {
    setBusy(true)
    setError(undefined)
    try {
      await block({ username })
      setConfirmingBlock(false)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not block this person. Please try again."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header className="flex min-h-16 items-center gap-3 border-b px-3 sm:px-4">
        <Button
          aria-label="Back to messages"
          className="md:hidden"
          render={<Link href="/messages" />}
          size="icon"
          variant="ghost"
        >
          <ArrowLeft />
        </Button>
        <ProfileAvatar profile={participant} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{participant.displayName}</h1>
          <p className="truncate text-xs text-muted-foreground">
            @{participant.username}
          </p>
        </div>
        {isArchived ? (
          <span className="text-xs font-medium text-muted-foreground">Archived</span>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Conversation options"
            render={<Button size="icon" type="button" variant="ghost" />}
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem render={<Link href={`/profile/${username}`} />}>
              View profile
            </DropdownMenuItem>
            {!isArchived ? (
              <DropdownMenuItem
                onClick={() => setConfirmingBlock(true)}
                variant="destructive"
              >
                <ShieldBan />
                Block {participant.displayName}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      {error ? (
        <p className="border-b px-4 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmingBlock(false)
        }}
        open={confirmingBlock}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block {participant.displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes them as a friend and prevents future connection
              requests and messages. Your conversation will remain archived.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => void confirmBlock()}
              type="button"
              variant="destructive"
            >
              {busy ? "Blocking…" : "Block"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function EmptyConversation({ participant }: { participant: FriendProfile }) {
  return (
    <Empty className="m-4 min-h-52 flex-1 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MessageCircle />
        </EmptyMedia>
        <EmptyTitle>Start a conversation</EmptyTitle>
        <EmptyDescription>
          Say hello to {participant.displayName}. Only friends can message each
          other on CoinArc.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function UnavailableConversation() {
  return (
    <main className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-xl items-center p-4">
      <Empty className="min-h-56 border bg-card shadow-sm ring-1 ring-foreground/5">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageCircle />
          </EmptyMedia>
          <EmptyTitle>Conversation unavailable</EmptyTitle>
          <EmptyDescription>
            Direct messages are available only between friends.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button render={<Link href="/messages" />} type="button">
            Back to messages
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  )
}

function ConversationThread({ username }: { username: string }) {
  const conversation = useQuery(conversationForUsername, { username })

  if (conversation === undefined) {
    return (
      <section className="flex min-h-[calc(100svh-4rem)] flex-1 items-center justify-center text-sm text-muted-foreground md:min-h-0">
        Loading conversation…
      </section>
    )
  }
  if (conversation.status === "unavailable") return <UnavailableConversation />

  const isArchived = conversation.status === "archived"
  const conversationId =
    conversation.status === "active" || conversation.status === "archived"
      ? conversation.conversationId
      : undefined

  return (
    <section className="flex h-[calc(100svh-4rem)] min-h-0 flex-1 flex-col md:h-full">
      <ConversationHeader
        isArchived={isArchived}
        participant={conversation.participant}
        username={username}
      />
      {conversation.status === "empty" ? (
        <EmptyConversation participant={conversation.participant} />
      ) : (
        <ConversationHistory
          conversationId={conversationId}
          isArchived={isArchived}
          participant={conversation.participant}
        />
      )}
      {isArchived ? (
        <div className="border-t bg-muted/40 px-4 py-3 text-center text-sm text-muted-foreground">
          This conversation is archived and read-only until you are friends
          again.
        </div>
      ) : (
        <Composer participant={conversation.participant} username={username} />
      )}
    </section>
  )
}

export function DirectConversation({ username }: { username: string }) {
  return (
    <main className="min-h-[calc(100svh-4rem)] md:h-[calc(100svh-4rem)]">
      <div className="mx-auto flex h-full w-full max-w-6xl">
        <aside className="hidden w-92 shrink-0 border-r p-4 md:flex md:flex-col">
          <InboxPanel className="h-full" selectedUsername={username} />
        </aside>
        <ConversationThread username={username} />
      </div>
    </main>
  )
}

export function HeaderMessageButton() {
  const { isAuthenticated } = useConvexAuth()
  const unreadCount = useQuery(
    unreadMessageCount,
    isAuthenticated ? {} : "skip"
  )
  const unread = unreadCount ?? 0

  return (
    <Button
      aria-label={
        unread > 0 ? `Open messages, ${unread} unread` : "Open messages"
      }
      className="relative"
      render={<Link href="/messages" />}
      size="icon"
      type="button"
      variant="ghost"
    >
      <MessageCircle />
      {unread > 0 ? (
        <span
          aria-hidden
          className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground ring-2 ring-background"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Button>
  )
}

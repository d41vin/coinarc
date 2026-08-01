"use client"

import { LoaderCircle, WalletCards, X } from "lucide-react"
import { useMemo, useState } from "react"
import { useConvexAuth, useQuery } from "convex/react"
import { makeFunctionReference } from "convex/server"
import { isAddress } from "viem"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"

export type CoinArcRecipient = {
  userId: string
  displayName: string
  username: string
  avatarUrl?: string
  walletAddress?: string
  isFriend: boolean
}

export type PaymentRecipient =
  | { type: "coinarc"; recipient: CoinArcRecipient }
  | { type: "address"; address: string }

type RecipientOption =
  | { kind: "coinarc"; recipient: CoinArcRecipient }
  | { kind: "address"; address: string }

const searchRecipients = makeFunctionReference<
  "query",
  { query: string },
  CoinArcRecipient[]
>("payments:searchRecipients")
const searchFriends = makeFunctionReference<
  "query",
  { query: string },
  CoinArcRecipient[]
>("paymentRequests:searchFriends")

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

function MemberOption({ recipient }: { recipient: CoinArcRecipient }) {
  return (
    <>
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
          {recipient.isFriend ? <Badge variant="outline">Friend</Badge> : null}
        </span>
        {recipient.walletAddress ? (
          <span className="block truncate font-mono text-xs text-muted-foreground">
            {shortAddress(recipient.walletAddress)}
          </span>
        ) : null}
      </span>
    </>
  )
}

function SelectedRecipient({
  disabled,
  onRemove,
  value,
}: {
  disabled: boolean
  onRemove: () => void
  value: PaymentRecipient
}) {
  const recipient = value.type === "coinarc" ? value.recipient : null
  const address = value.type === "address" ? value.address : null

  return (
    <div
      aria-label={
        recipient ? `Recipient ${recipient.displayName}` : "Wallet recipient"
      }
      className="flex items-center gap-3 rounded-2xl border p-3"
      role="group"
    >
      {recipient ? (
        <Avatar>
          {recipient.avatarUrl ? (
            <AvatarImage alt="" src={recipient.avatarUrl} />
          ) : null}
          <AvatarFallback className="bg-primary text-primary-foreground">
            {initials(recipient.displayName)}
          </AvatarFallback>
        </Avatar>
      ) : (
        <span className="flex size-9 items-center justify-center rounded-full bg-muted">
          <WalletCards className="size-4" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-medium">
          {recipient ? recipient.displayName : "External wallet address"}
        </span>
        <span className="flex items-center gap-1 truncate text-sm text-muted-foreground">
          {recipient ? `@${recipient.username}` : address}
          {recipient?.isFriend ? <Badge variant="outline">Friend</Badge> : null}
        </span>
      </span>
      <Button
        aria-label="Remove recipient"
        disabled={disabled}
        onClick={onRemove}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <X />
      </Button>
    </div>
  )
}

export function RecipientPicker({
  disabled = false,
  friendsOnly = false,
  id,
  onChange,
  value,
}: {
  disabled?: boolean
  friendsOnly?: boolean
  id: string
  onChange: (recipient: PaymentRecipient | null) => void
  value: PaymentRecipient | null
}) {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const [inputValue, setInputValue] = useState("")
  const [open, setOpen] = useState(false)
  const normalizedInput = inputValue.trim()
  const isWalletAddress =
    !friendsOnly && isAddress(normalizedInput, { strict: false })
  const recipientSearch = useQuery(
    friendsOnly ? searchFriends : searchRecipients,
    isAuthenticated && !value && normalizedInput.length >= 2
      ? { query: normalizedInput }
      : "skip"
  )

  const matchingRecipients = recipientSearch ?? []
  const availableRecipients = friendsOnly
    ? matchingRecipients
    : matchingRecipients.filter((recipient) => recipient.walletAddress)
  const unavailableRecipients = friendsOnly
    ? []
    : matchingRecipients.filter((recipient) => !recipient.walletAddress)
  const options = useMemo<RecipientOption[]>(() => {
    const memberOptions = availableRecipients.map((recipient) => ({
      kind: "coinarc" as const,
      recipient,
    }))
    return isWalletAddress
      ? [
          ...memberOptions,
          { kind: "address" as const, address: normalizedInput },
        ]
      : memberOptions
  }, [availableRecipients, isWalletAddress, normalizedInput])
  const panelOpen = open && !value && normalizedInput.length >= 2

  function clearRecipient() {
    setInputValue("")
    setOpen(false)
    onChange(null)
  }

  function selectRecipient(next: RecipientOption | null) {
    if (!next) return
    setInputValue("")
    setOpen(false)
    onChange(
      next.kind === "coinarc"
        ? { type: "coinarc", recipient: next.recipient }
        : { type: "address", address: next.address }
    )
  }

  if (value) {
    return (
      <SelectedRecipient
        disabled={disabled}
        onRemove={clearRecipient}
        value={value}
      />
    )
  }

  return (
    <Combobox
      autoHighlight
      disabled={disabled}
      filter={null}
      inputValue={inputValue}
      items={options}
      itemToStringLabel={(option: RecipientOption) =>
        option.kind === "coinarc"
          ? `${option.recipient.displayName} @${option.recipient.username}`
          : option.address
      }
      onInputValueChange={(nextInput) => {
        setInputValue(nextInput)
        setOpen(nextInput.trim().length >= 2)
      }}
      onOpenChange={(nextOpen) =>
        setOpen(nextOpen && normalizedInput.length >= 2)
      }
      onValueChange={(nextOption) =>
        selectRecipient(nextOption as RecipientOption | null)
      }
      open={panelOpen}
      value={null}
    >
      <ComboboxInput
        aria-describedby={`${id}-help`}
        autoComplete="off"
        id={id}
        placeholder={
          friendsOnly
            ? "Friend name or @username"
            : "Name, @username, or wallet address"
        }
        showTrigger={false}
      />
      <p className="sr-only" id={`${id}-help`}>
        {friendsOnly
          ? "Search your CoinArc friends by name or username."
          : "Search CoinArc members by name, username, or wallet address."}
      </p>
      {panelOpen ? (
        <div
          aria-busy={recipientSearch === undefined || isLoading || undefined}
          className="mt-2 overflow-hidden rounded-2xl border bg-popover"
        >
          {recipientSearch === undefined || isLoading ? (
            <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Searching CoinArc members…
            </p>
          ) : null}
          {recipientSearch !== undefined && !isLoading && options.length > 0 ? (
            <ComboboxList>
              {(option: RecipientOption) =>
                option.kind === "coinarc" ? (
                  <ComboboxItem key={option.recipient.userId} value={option}>
                    <MemberOption recipient={option.recipient} />
                  </ComboboxItem>
                ) : (
                  <ComboboxItem key={option.address} value={option}>
                    <span className="flex size-9 items-center justify-center rounded-full bg-muted">
                      <WalletCards className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        Use external wallet
                      </span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {option.address}
                      </span>
                    </span>
                  </ComboboxItem>
                )
              }
            </ComboboxList>
          ) : null}
          {recipientSearch !== undefined &&
          !isLoading &&
          unavailableRecipients.length > 0 ? (
            <div className="border-t px-3 py-2">
              <p className="px-1 pb-1 text-xs text-muted-foreground">
                Not ready to receive on Arc Testnet
              </p>
              {unavailableRecipients.map((recipient) => (
                <div
                  className="flex items-center gap-3 rounded-2xl px-1 py-2 opacity-60"
                  key={recipient.userId}
                >
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
                    <span className="block truncate text-sm text-muted-foreground">
                      @{recipient.username}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {recipientSearch !== undefined &&
          !isLoading &&
          options.length === 0 &&
          unavailableRecipients.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              No CoinArc members match “{normalizedInput}”.
            </p>
          ) : null}
        </div>
      ) : null}
    </Combobox>
  )
}

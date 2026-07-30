"use client"

import { createSiweMessage } from "viem/siwe"
import { useConnect, useConnectors, useDisconnect, useSignMessage } from "wagmi"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ARC_TESTNET_CHAIN_ID } from "@/lib/arc-testnet"

type NonceResponse = { nonce?: string; error?: string }
type VerifyResponse = { address?: string; error?: string }

function readableWalletError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : ""
  if (/user rejected|user denied|rejected request/i.test(message))
    return "Wallet connection or signature was cancelled."
  if (/chain|network/i.test(message))
    return "Switch this wallet to Arc Testnet, then try again."
  return "Could not link this wallet. Try again or choose another wallet."
}

export function WalletLinkButton() {
  const connectors = useConnectors()
  const { connectAsync } = useConnect()
  const { disconnectAsync } = useDisconnect()
  const { signMessageAsync } = useSignMessage()
  const visibleConnectors = connectors.filter(
    (connector, index) =>
      connectors.findIndex((candidate) => candidate.id === connector.id) ===
      index
  )
  const [open, setOpen] = useState(false)
  const [busyWallet, setBusyWallet] = useState<string>()
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState<string>()

  async function linkWallet(connector: (typeof connectors)[number]) {
    setBusyWallet(connector.uid)
    setError(undefined)
    setStatus(`Connecting to ${connector.name}â€¦`)

    try {
      await disconnectAsync().catch(() => undefined)
      const connection = await connectAsync({
        connector,
        chainId: ARC_TESTNET_CHAIN_ID,
      })
      const address = connection.accounts[0]
      if (!address || connection.chainId !== ARC_TESTNET_CHAIN_ID)
        throw new Error("Unsupported network")

      setStatus("Preparing a wallet-link messageâ€¦")
      const nonceResponse = await fetch("/api/settings/wallet-link/nonce")
      const nonceData = (await nonceResponse.json()) as NonceResponse
      if (!nonceResponse.ok || !nonceData.nonce)
        throw new Error(nonceData.error || "Could not start wallet linking")

      const issuedAt = new Date()
      const message = createSiweMessage({
        domain: window.location.host,
        address,
        statement: "Link this wallet to your CoinArc account.",
        uri: `${window.location.origin}/settings`,
        version: "1",
        chainId: ARC_TESTNET_CHAIN_ID,
        nonce: nonceData.nonce,
        issuedAt,
        expirationTime: new Date(issuedAt.getTime() + 10 * 60_000),
      })
      setStatus("Confirm the signature in your walletâ€¦")
      const signature = await signMessageAsync({ message })

      setStatus("Linking walletâ€¦")
      const verifyResponse = await fetch("/api/settings/wallet-link/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      })
      const verifyData = (await verifyResponse.json()) as VerifyResponse
      if (!verifyResponse.ok || !verifyData.address)
        throw new Error(verifyData.error || "Could not link this wallet")

      setStatus("Wallet linked.")
      window.setTimeout(() => setOpen(false), 700)
    } catch (reason) {
      setStatus(undefined)
      setError(readableWalletError(reason))
    } finally {
      setBusyWallet(undefined)
    }
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) {
          setError(undefined)
          setStatus(undefined)
        }
      }}
      open={open}
    >
      <DialogTrigger render={<Button size="sm" type="button" />}>
        Link external wallet
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link an external wallet</DialogTitle>
          <DialogDescription>
            Choose the exact wallet to add. You will sign a message to prove
            ownership; this never sends a transaction or costs gas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {visibleConnectors.map((connector) => (
            <Button
              className="w-full justify-start"
              disabled={Boolean(busyWallet)}
              key={connector.uid}
              onClick={() => void linkWallet(connector)}
              type="button"
              variant="outline"
            >
              {busyWallet === connector.uid
                ? `Connecting to ${connector.name}â€¦`
                : connector.name}
            </Button>
          ))}
        </div>
        {status ? (
          <p className="text-sm text-muted-foreground" role="status">
            {status}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}

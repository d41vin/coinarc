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
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_RPC } from "@/lib/arc-testnet"

type NonceResponse = { nonce?: string; error?: string }
type VerifyResponse = { address?: string; error?: string }
type LinkPhase = "connection" | "network" | "signature" | "verification"
type WalletRpcProvider = {
  request: (request: {
    method: string
    params?: readonly unknown[]
  }) => Promise<unknown>
}
type WalletConnector = {
  getProvider: () => Promise<unknown>
}

function readableWalletError(reason: unknown, phase: LinkPhase) {
  const message = reason instanceof Error ? reason.message : ""
  if (/user rejected|user denied|rejected request/i.test(message)) {
    if (phase === "network") return "Switching to Arc Testnet was cancelled."
    if (phase === "signature") return "Wallet-link signature was cancelled."
    return "Wallet connection was cancelled."
  }
  if (/chain|network/i.test(message))
    return "Switch this wallet to Arc Testnet, then try again."
  return "Could not link this wallet. Try again or choose another wallet."
}

function errorCode(reason: unknown) {
  if (
    reason &&
    typeof reason === "object" &&
    "code" in reason &&
    typeof reason.code === "number"
  )
    return reason.code
  return undefined
}

function isWalletRpcProvider(value: unknown): value is WalletRpcProvider {
  if (!value || typeof value !== "object") return false
  return "request" in value && typeof value.request === "function"
}

async function ensureArcTestnet(connector: WalletConnector) {
  const candidate = await connector.getProvider()
  if (!isWalletRpcProvider(candidate))
    throw new Error("Wallet provider is unavailable")
  const provider = candidate

  const activeChain = await provider.request({ method: "eth_chainId" })
  if (
    typeof activeChain === "string" &&
    Number.parseInt(activeChain, 16) === ARC_TESTNET_CHAIN_ID
  )
    return

  const chainId = `0x${ARC_TESTNET_CHAIN_ID.toString(16)}`
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    })
  } catch (reason) {
    if (errorCode(reason) !== 4902) throw reason
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: "Arc Testnet",
          nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
          rpcUrls: [ARC_TESTNET_RPC],
        },
      ],
    })
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    })
  }

  const confirmedChain = await provider.request({ method: "eth_chainId" })
  if (
    typeof confirmedChain !== "string" ||
    Number.parseInt(confirmedChain, 16) !== ARC_TESTNET_CHAIN_ID
  )
    throw new Error("Unsupported network")
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
    let phase: LinkPhase = "connection"
    setBusyWallet(connector.uid)
    setError(undefined)
    setStatus(`Connecting to ${connector.name}â€¦`)

    try {
      await disconnectAsync().catch(() => undefined)
      const connection = await connectAsync({ connector })
      const address = connection.accounts[0]
      if (!address) throw new Error("Wallet did not provide an address")

      phase = "network"
      setStatus("Switching wallet to Arc Testnetâ€¦")
      await ensureArcTestnet(connector)

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
      phase = "signature"
      setStatus("Confirm the signature in your walletâ€¦")
      const signature = await signMessageAsync({ message })

      phase = "verification"
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
      setError(readableWalletError(reason, phase))
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

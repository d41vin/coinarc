"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createAuthenticationAdapter, getDefaultConfig, RainbowKitAuthenticationProvider, RainbowKitProvider } from "@rainbow-me/rainbowkit"
import "@rainbow-me/rainbowkit/styles.css"
import { WagmiProvider } from "wagmi"
import { defineChain } from "viem"
import { createSiweMessage } from "viem/siwe"
import { useState, type ReactNode } from "react"
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_RPC } from "@/lib/arc-testnet"

const arcTestnet = defineChain({ id: ARC_TESTNET_CHAIN_ID, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 }, rpcUrls: { default: { http: [ARC_TESTNET_RPC] } }, testnet: true })
const config = getDefaultConfig({ appName: "CoinArc", projectId: process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "missing-reown-project-id", chains: [arcTestnet], ssr: true })

const adapter = createAuthenticationAdapter<string>({
  getNonce: async () => { const response = await fetch("/api/auth/siwe/nonce"); if (!response.ok) throw new Error("Could not start wallet sign-in"); return (await response.json() as { nonce: string }).nonce },
  createMessage: ({ nonce, address, chainId }) => createSiweMessage({ domain: window.location.host, address, statement: "Sign in to CoinArc.", uri: `${window.location.origin}/sign-in`, version: "1", chainId, nonce, issuedAt: new Date(), expirationTime: new Date(Date.now() + 10 * 60_000) }),
  verify: async ({ message, signature }) => { const response = await fetch("/api/auth/siwe/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, signature }) }); if (!response.ok) return false; window.location.assign((await response.json() as { destination: string }).destination); return true },
  signOut: async () => { await fetch("/api/auth/sign-out", { method: "POST" }) },
})

export function WalletProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  return <WagmiProvider config={config}><QueryClientProvider client={queryClient}><RainbowKitAuthenticationProvider adapter={adapter} status="unauthenticated"><RainbowKitProvider initialChain={arcTestnet}>{children}</RainbowKitProvider></RainbowKitAuthenticationProvider></QueryClientProvider></WagmiProvider>
}

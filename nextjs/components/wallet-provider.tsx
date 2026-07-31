"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createAuthenticationAdapter,
  getDefaultConfig,
  RainbowKitAuthenticationProvider,
  RainbowKitProvider,
} from "@rainbow-me/rainbowkit"
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets"
import "@rainbow-me/rainbowkit/styles.css"
import { createConnector, WagmiProvider } from "wagmi"
import { injected, type InjectedParameters } from "wagmi/connectors"
import { defineChain } from "viem"
import { createSiweMessage } from "viem/siwe"
import { useState, type ReactNode } from "react"
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_EXPLORER,
  ARC_TESTNET_NATIVE_USDC_DECIMALS,
  ARC_TESTNET_RPC,
} from "@/lib/arc-testnet"

type BrowserProvider = Extract<
  Extract<
    NonNullable<InjectedParameters["target"]>,
    { provider: unknown }
  >["provider"],
  { request: unknown; on: unknown }
>

function browserProviders() {
  if (typeof window === "undefined") return []
  const ethereum = (window as unknown as { ethereum?: BrowserProvider })
    .ethereum
  if (!ethereum) return []
  return ethereum.providers?.length ? ethereum.providers : [ethereum]
}

function metaMaskProvider() {
  return browserProviders().find(
    (provider) => provider.isMetaMask && !provider.isPhantom
  )
}

function coinbaseProvider() {
  if (typeof window === "undefined") return undefined
  const extensionProvider = (
    window as unknown as { coinbaseWalletExtension?: BrowserProvider }
  ).coinbaseWalletExtension
  return (
    extensionProvider ??
    browserProviders().find((provider) => provider.isCoinbaseWallet)
  )
}

function walletWithExplicitProvider(
  wallet: ReturnType<typeof metaMaskWallet>,
  id: string,
  name: string,
  provider: BrowserProvider
) {
  return {
    ...wallet,
    installed: true,
    createConnector: (
      walletDetails: Parameters<typeof wallet.createConnector>[0]
    ) =>
      createConnector((config) => ({
        ...injected({ target: { id, name, provider } })(config),
        ...walletDetails,
      })),
  }
}

const explicitMetaMaskWallet = (...args: Parameters<typeof metaMaskWallet>) => {
  const wallet = metaMaskWallet(...args)
  const provider = metaMaskProvider()
  if (!provider) return wallet

  return walletWithExplicitProvider(wallet, "metaMask", "MetaMask", provider)
}

const explicitCoinbaseWallet = (...args: Parameters<typeof coinbaseWallet>) => {
  const wallet = coinbaseWallet(...args)
  const provider = coinbaseProvider()
  if (!provider) return wallet

  return walletWithExplicitProvider(
    wallet,
    "coinbaseWallet",
    "Coinbase Wallet",
    provider
  )
}

const singleProviderWallet = () => {
  const wallet = injectedWallet()
  return {
    ...wallet,
    hidden: () => browserProviders().length !== 1,
  }
}

const arcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: ARC_TESTNET_NATIVE_USDC_DECIMALS,
  },
  rpcUrls: { default: { http: [ARC_TESTNET_RPC] } },
  blockExplorers: {
    default: { name: "Arcscan", url: ARC_TESTNET_EXPLORER },
  },
  testnet: true,
})
const config = getDefaultConfig({
  appName: "CoinArc",
  projectId:
    process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "missing-reown-project-id",
  chains: [arcTestnet],
  ssr: true,
  wallets: [
    {
      groupName: "Recommended",
      wallets: [
        explicitMetaMaskWallet,
        rabbyWallet,
        rainbowWallet,
        explicitCoinbaseWallet,
      ],
    },
    {
      groupName: "Other EVM wallets",
      wallets: [singleProviderWallet, walletConnectWallet],
    },
  ],
})

const adapter = createAuthenticationAdapter<string>({
  getNonce: async () => {
    const response = await fetch("/api/auth/siwe/nonce")
    if (!response.ok) throw new Error("Could not start wallet sign-in")
    return ((await response.json()) as { nonce: string }).nonce
  },
  createMessage: ({ nonce, address, chainId }) =>
    createSiweMessage({
      domain: window.location.host,
      address,
      statement: "Sign in to CoinArc.",
      uri: `${window.location.origin}/sign-in`,
      version: "1",
      chainId,
      nonce,
      issuedAt: new Date(),
      expirationTime: new Date(Date.now() + 10 * 60_000),
    }),
  verify: async ({ message, signature }) => {
    const response = await fetch("/api/auth/siwe/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, signature }),
    })
    if (!response.ok) return false
    window.location.assign(
      ((await response.json()) as { destination: string }).destination
    )
    return true
  },
  signOut: async () => {
    await fetch("/api/auth/sign-out", { method: "POST" })
  },
})

export function WalletProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitAuthenticationProvider
          adapter={adapter}
          status="unauthenticated"
        >
          <RainbowKitProvider initialChain={arcTestnet}>
            {children}
          </RainbowKitProvider>
        </RainbowKitAuthenticationProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

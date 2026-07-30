import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets"
import { isAddress } from "viem"

import { ARC_TESTNET_CHAIN_ID } from "@/lib/arc-testnet"
import type { WalletClaim } from "@/lib/auth"

export async function findCircleArcTestnetWallet(
  apiKey: string,
  userToken: string
): Promise<WalletClaim | null> {
  const result = await initiateUserControlledWalletsClient({
    apiKey,
  }).listWallets({
    userToken,
    blockchain: "ARC-TESTNET",
  })
  const wallet = result.data?.wallets.find(
    (candidate) =>
      candidate.blockchain === "ARC-TESTNET" &&
      typeof candidate.id === "string" &&
      isAddress(candidate.address)
  )

  if (!wallet) return null

  return {
    address: wallet.address.toLowerCase(),
    chainId: ARC_TESTNET_CHAIN_ID,
    custody: "circle",
    circleWalletId: wallet.id,
  }
}

export async function getCircleArcTestnetWallet(
  apiKey: string,
  userToken: string
): Promise<WalletClaim> {
  // Circle completes wallet-creation challenges asynchronously. A short,
  // bounded retry keeps a successfully completed challenge from racing the
  // first wallet-list request.
  for (const delayMs of [0, 250, 750, 1_500]) {
    if (delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }

    const wallet = await findCircleArcTestnetWallet(apiKey, userToken)
    if (wallet) return wallet
  }

  throw new Error("Circle did not return an Arc Testnet wallet")
}

import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets"
import { isAddress } from "viem"

import { ARC_TESTNET_CHAIN_ID } from "@/lib/arc-testnet"
import type { WalletClaim } from "@/lib/auth"

export async function getCircleArcTestnetWallet(
  apiKey: string,
  userToken: string
): Promise<WalletClaim> {
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

  if (!wallet) {
    throw new Error("Circle did not return an Arc Testnet wallet")
  }

  return {
    address: wallet.address.toLowerCase(),
    chainId: ARC_TESTNET_CHAIN_ID,
    custody: "circle",
    circleWalletId: wallet.id,
  }
}

import { NextResponse } from "next/server"
import { createPublicClient, formatUnits, http, type Address } from "viem"

import {
  ARC_TESTNET_RPC,
  ARC_TESTNET_USDC_ADDRESS,
  ARC_TESTNET_USDC_DECIMALS,
  arcUsdcAbi,
} from "@/lib/arc-testnet"
import { getSession } from "@/lib/auth"
import { primaryWalletForSession } from "@/lib/convex-server"

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({
      amount: null,
      baseUnits: null,
      balanceAvailable: false,
      walletAvailable: false,
    })
  }

  let address = session.wallet?.address

  if (!address) {
    try {
      address = (await primaryWalletForSession(session))?.address
    } catch {
      return NextResponse.json({
        amount: null,
        baseUnits: null,
        balanceAvailable: false,
        walletAvailable: false,
      })
    }
  }

  if (!address) {
    return NextResponse.json({
      amount: null,
      baseUnits: null,
      balanceAvailable: false,
      walletAvailable: false,
    })
  }

  try {
    const balance = await createPublicClient({
      transport: http(ARC_TESTNET_RPC),
    }).readContract({
      address: ARC_TESTNET_USDC_ADDRESS,
      abi: arcUsdcAbi,
      functionName: "balanceOf",
      args: [address as Address],
    })

    return NextResponse.json({
      amount: formatUnits(balance, ARC_TESTNET_USDC_DECIMALS),
      baseUnits: balance.toString(),
      balanceAvailable: true,
      walletAvailable: true,
    })
  } catch {
    return NextResponse.json({
      amount: null,
      baseUnits: null,
      balanceAvailable: false,
      walletAvailable: true,
    })
  }
}

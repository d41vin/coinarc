import { NextResponse } from "next/server"
import { createPublicClient, formatUnits, http } from "viem"

import { ARC_TESTNET_RPC } from "@/lib/arc-testnet"
import { getSession } from "@/lib/auth"
import { primaryWalletForSession } from "@/lib/convex-server"

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({
      amount: null,
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
        balanceAvailable: false,
        walletAvailable: false,
      })
    }
  }

  if (!address) {
    return NextResponse.json({
      amount: null,
      balanceAvailable: false,
      walletAvailable: false,
    })
  }

  try {
    const balance = await createPublicClient({
      transport: http(ARC_TESTNET_RPC),
    }).getBalance({ address: address as `0x${string}` })

    return NextResponse.json({
      amount: formatUnits(balance, 6),
      balanceAvailable: true,
      walletAvailable: true,
    })
  } catch {
    return NextResponse.json({
      amount: null,
      balanceAvailable: false,
      walletAvailable: true,
    })
  }
}

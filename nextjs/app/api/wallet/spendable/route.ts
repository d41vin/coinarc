import { NextResponse } from "next/server"
import { createPublicClient, http, isAddress, type Address } from "viem"

import {
  ARC_TESTNET_RPC,
  ARC_TESTNET_USDC_ADDRESS,
  arcUsdcAbi,
} from "@/lib/arc-testnet"
import { getSession } from "@/lib/auth"
import { primaryWalletForSession } from "@/lib/convex-server"

const NATIVE_UNITS_PER_USDC_BASE_UNIT = BigInt(10) ** BigInt(12)
const FEE_SAFETY_BASIS_POINTS = BigInt(12_000)
const BASIS_POINTS = BigInt(10_000)

function divideAndRoundUp(value: bigint, divisor: bigint) {
  return (value + divisor - BigInt(1)) / divisor
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body: unknown = await request.json().catch(() => null)
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { destinationAddress?: unknown }).destinationAddress !==
      "string"
  ) {
    return NextResponse.json(
      { error: "Invalid payment destination" },
      { status: 400 }
    )
  }

  const destinationAddress = (
    body as { destinationAddress: string }
  ).destinationAddress.trim()
  if (!isAddress(destinationAddress, { strict: false })) {
    return NextResponse.json(
      { error: "Invalid payment destination" },
      { status: 400 }
    )
  }

  let sourceAddress = session.wallet?.address
  if (!sourceAddress) {
    try {
      sourceAddress = (await primaryWalletForSession(session))?.address
    } catch {
      return NextResponse.json(
        { error: "A receiving wallet is required" },
        { status: 409 }
      )
    }
  }
  if (!sourceAddress) {
    return NextResponse.json(
      { error: "A receiving wallet is required" },
      { status: 409 }
    )
  }

  try {
    const publicClient = createPublicClient({
      transport: http(ARC_TESTNET_RPC),
    })
    const [balance, gasPrice, estimatedGas] = await Promise.all([
      publicClient.readContract({
        address: ARC_TESTNET_USDC_ADDRESS,
        abi: arcUsdcAbi,
        functionName: "balanceOf",
        args: [sourceAddress as Address],
      }),
      publicClient.getGasPrice(),
      publicClient.estimateContractGas({
        account: sourceAddress as Address,
        address: ARC_TESTNET_USDC_ADDRESS,
        abi: arcUsdcAbi,
        functionName: "transfer",
        args: [destinationAddress as Address, BigInt(1)],
      }),
    ])
    const nativeFeeWithBuffer = divideAndRoundUp(
      estimatedGas * gasPrice * FEE_SAFETY_BASIS_POINTS,
      BASIS_POINTS
    )
    const feeReserveBaseUnits = divideAndRoundUp(
      nativeFeeWithBuffer,
      NATIVE_UNITS_PER_USDC_BASE_UNIT
    )
    const spendableBaseUnits =
      balance > feeReserveBaseUnits ? balance - feeReserveBaseUnits : BigInt(0)

    return NextResponse.json({
      destinationAddress: destinationAddress.toLowerCase(),
      balanceBaseUnits: balance.toString(),
      spendableBaseUnits: spendableBaseUnits.toString(),
      feeReserveBaseUnits: feeReserveBaseUnits.toString(),
    })
  } catch {
    return NextResponse.json(
      { error: "Could not estimate a spendable balance" },
      { status: 503 }
    )
  }
}

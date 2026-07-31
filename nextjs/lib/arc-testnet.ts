import type { Address } from "viem"

export const ARC_TESTNET_CHAIN_ID = 5_042_002
export const ARC_TESTNET_RPC =
  process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL ||
  "https://rpc.testnet.arc.network"
export const ARC_TESTNET_EXPLORER = "https://testnet.arcscan.app"

// Arc's native USDC gas balance uses 18-decimal accounting. Applications
// should use this ERC-20 interface for user-facing USDC balances and sends,
// which uses the conventional six decimals and shares the same balance.
export const ARC_TESTNET_USDC_ADDRESS =
  "0x3600000000000000000000000000000000000000" as Address
export const ARC_TESTNET_USDC_DECIMALS = 6
export const ARC_TESTNET_NATIVE_USDC_DECIMALS = 18

export const arcUsdcAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
    anonymous: false,
  },
] as const

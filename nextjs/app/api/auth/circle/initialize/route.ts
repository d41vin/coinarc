import { NextResponse } from "next/server"
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || typeof (body as { userToken?: unknown }).userToken !== "string") return NextResponse.json({ error: "Invalid Circle session" }, { status: 400 })
  const apiKey = process.env.CIRCLE_API_KEY; if (!apiKey) return NextResponse.json({ error: "Circle is not configured" }, { status: 500 })
  try { const result = await fetch("https://api.circle.com/v1/w3s/user/initialize", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "X-User-Token": (body as { userToken: string }).userToken }, body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), accountType: "SCA", blockchains: ["ARC-TESTNET"] }) }); const data: unknown = await result.json(); if (result.ok) return NextResponse.json(data); const code = typeof data === "object" && data && "code" in data ? (data as { code?: unknown }).code : undefined; if (code === 155106) return NextResponse.json({ alreadyInitialized: true }); return NextResponse.json({ error: "Could not initialize your CoinArc wallet" }, { status: result.status }) } catch { return NextResponse.json({ error: "Could not initialize your CoinArc wallet" }, { status: 502 }) }
}

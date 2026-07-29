import { NextResponse } from "next/server"
import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets"
import { circleOtpCookieValue } from "@/lib/auth"
import { createCircleOtpAttempt } from "@/lib/convex-server"
import { randomBytes } from "node:crypto"

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || typeof (body as { email?: unknown }).email !== "string" || typeof (body as { deviceId?: unknown }).deviceId !== "string") return NextResponse.json({ error: "Invalid email sign-in request" }, { status: 400 })
  const { email, deviceId } = body as { email: string; deviceId: string }
  if (!/^\S+@\S+\.\S+$/.test(email) || !deviceId) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 })
  try {
    const apiKey = process.env.CIRCLE_API_KEY; if (!apiKey) throw new Error("Circle is not configured")
    const normalizedEmail = email.trim().toLowerCase()
    const result = await initiateUserControlledWalletsClient({ apiKey }).createDeviceTokenForEmailLogin({ email: normalizedEmail, deviceId, idempotencyKey: crypto.randomUUID() })
    const attemptId = randomBytes(32).toString("base64url")
    await createCircleOtpAttempt(attemptId, normalizedEmail, deviceId)
    const response = NextResponse.json(result.data)
    response.cookies.set(circleOtpCookieValue(attemptId))
    return response
  } catch { return NextResponse.json({ error: "Unable to send a verification code" }, { status: 502 }) }
}

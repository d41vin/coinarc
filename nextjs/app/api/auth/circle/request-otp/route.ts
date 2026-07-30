import { NextResponse } from "next/server"
import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets"
import { circleOtpCookieValue } from "@/lib/auth"
import { createCircleOtpAttempt } from "@/lib/convex-server"
import { randomBytes } from "node:crypto"

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { email?: unknown }).email !== "string" ||
    typeof (body as { deviceId?: unknown }).deviceId !== "string"
  ) {
    return NextResponse.json(
      { error: "Invalid email sign-in request" },
      { status: 400 }
    )
  }
  const { email, deviceId } = body as { email: string; deviceId: string }
  if (!/^\S+@\S+\.\S+$/.test(email) || !deviceId) {
    return NextResponse.json(
      { error: "Enter a valid email address" },
      { status: 400 }
    )
  }

  try {
    const apiKey = process.env.CIRCLE_API_KEY
    if (!apiKey) throw new Error("Circle is not configured")
    const normalizedEmail = email.trim().toLowerCase()
    const attemptId = randomBytes(32).toString("base64url")
    const attempt = await createCircleOtpAttempt(
      attemptId,
      normalizedEmail,
      deviceId
    )
    if (!attempt.allowed) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((attempt.retryAfterMs ?? 0) / 1_000)
      )
      return NextResponse.json(
        {
          error: `Too many verification codes requested. Try again in ${retryAfterSeconds} seconds.`,
        },
        { status: 429 }
      )
    }

    const result = await initiateUserControlledWalletsClient({
      apiKey,
    }).createDeviceTokenForEmailLogin({
      email: normalizedEmail,
      deviceId,
      idempotencyKey: crypto.randomUUID(),
    })
    const response = NextResponse.json(result.data)
    response.cookies.set(circleOtpCookieValue(attemptId))
    return response
  } catch (reason) {
    console.error("Circle OTP request failed", reason)
    return NextResponse.json(
      { error: "Unable to send a verification code" },
      { status: 502 }
    )
  }
}

import { NextResponse } from "next/server"
import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets"
import { consumeCircleOtpAttempt, resolveSession } from "@/lib/convex-server"
import {
  clearCircleOtpCookie,
  getCircleOtpAttemptId,
  sessionCookie,
  type Session,
} from "@/lib/auth"
import { getCircleArcTestnetWallet } from "@/lib/circle-wallet"

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  const reject = (status: number, error: string) => {
    const response = NextResponse.json({ error }, { status })
    response.cookies.set(clearCircleOtpCookie())
    return response
  }
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { userToken?: unknown }).userToken !== "string" ||
    typeof (body as { deviceId?: unknown }).deviceId !== "string"
  )
    return reject(400, "Invalid Circle sign-in response")
  const apiKey = process.env.CIRCLE_API_KEY
  if (!apiKey) return reject(500, "Email sign-in is not configured")
  const { userToken, deviceId } = body as {
    userToken: string
    deviceId: string
  }
  const attemptId = await getCircleOtpAttemptId()
  if (!attemptId)
    return reject(
      401,
      "Your email verification request expired. Request a new code."
    )

  let userId: string
  try {
    const circleUser = await initiateUserControlledWalletsClient({
      apiKey,
    }).getUserStatus({ userToken })
    userId = circleUser.data?.id ?? ""
  } catch (reason) {
    console.error("Circle email verification failed", reason)
    return reject(401, "Email verification failed. Request a new code.")
  }
  if (!userId)
    return reject(401, "Email verification failed. Request a new code.")

  let wallet: Session["wallet"]
  try {
    wallet = await getCircleArcTestnetWallet(apiKey, userToken)
  } catch (reason) {
    console.error("Circle Arc Testnet wallet lookup failed", reason)
    return reject(
      502,
      "Could not load your CoinArc wallet. Request a new code."
    )
  }

  let attempt: { email: string }
  try {
    attempt = await consumeCircleOtpAttempt(attemptId, deviceId)
  } catch (reason) {
    console.error("Circle OTP attempt could not be consumed", reason)
    return reject(
      401,
      "This verification code has expired or was replaced. Request a new code."
    )
  }

  const base: Omit<Session, "onboardingComplete"> = {
    sub: `circle:${userId}`,
    provider: "circle",
    email: attempt.email,
    wallet,
  }
  try {
    const state = await resolveSession(base)
    const response = NextResponse.json({
      destination: state.onboardingComplete ? "/home" : "/onboarding",
    })
    response.cookies.set(clearCircleOtpCookie())
    response.cookies.set(
      sessionCookie({ ...base, onboardingComplete: state.onboardingComplete })
    )
    return response
  } catch (reason) {
    console.error(
      "CoinArc session creation after Circle verification failed",
      reason
    )
    return reject(
      502,
      "Could not create your CoinArc session. Request a new code."
    )
  }
}

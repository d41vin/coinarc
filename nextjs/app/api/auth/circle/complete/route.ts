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
  try {
    const apiKey = process.env.CIRCLE_API_KEY
    if (!apiKey) throw new Error("Circle is not configured")
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
    const circleUser = await initiateUserControlledWalletsClient({
      apiKey,
    }).getUserStatus({ userToken })
    const userId = circleUser.data?.id
    if (!userId) throw new Error("Circle user was not returned")
    const attempt = await consumeCircleOtpAttempt(attemptId, deviceId)
    const wallet = await getCircleArcTestnetWallet(apiKey, userToken)
    const base: Omit<Session, "onboardingComplete"> = {
      sub: `circle:${userId}`,
      provider: "circle",
      email: attempt.email,
      wallet,
    }
    const state = await resolveSession(base)
    const response = NextResponse.json({
      destination: state.onboardingComplete ? "/home" : "/onboarding",
    })
    response.cookies.set(clearCircleOtpCookie())
    response.cookies.set(
      sessionCookie({ ...base, onboardingComplete: state.onboardingComplete })
    )
    return response
  } catch {
    const response = NextResponse.json(
      { error: "We could not verify your CoinArc wallet session" },
      { status: 401 }
    )
    response.cookies.set(clearCircleOtpCookie())
    return response
  }
}

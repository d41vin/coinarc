"use client"

import { ConnectButton } from "@rainbow-me/rainbowkit"
import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk"
import { useTheme } from "next-themes"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { saveCircleAuthorization } from "@/lib/circle-authorization"

type LoginResult = {
  userToken: string
  encryptionKey: string
  refreshToken?: string
}
type CircleThemeColor = Parameters<W3SSdk["setThemeColor"]>[0]

function circleThemeColor(): CircleThemeColor {
  const styles = window.getComputedStyle(document.documentElement)
  const token = (name: string) => styles.getPropertyValue(name).trim()
  const background = token("--background")
  const card = token("--card")
  const foreground = token("--foreground")
  const cardForeground = token("--card-foreground")
  const primary = token("--primary")
  const primaryForeground = token("--primary-foreground")
  const muted = token("--muted")
  const mutedForeground = token("--muted-foreground")
  const border = token("--border")
  const ring = token("--ring")
  const destructive = token("--destructive")

  return {
    backdrop: foreground,
    backdropOpacity: 0.7,
    bg: card,
    divider: border,
    error: destructive,
    inputBg: background,
    inputBorderFocused: ring,
    inputBorderFocusedError: destructive,
    inputText: foreground,
    interactiveBg: muted,
    mainBtnBg: primary,
    mainBtnBgDisabled: muted,
    mainBtnBgOnHover: primary,
    mainBtnText: primaryForeground,
    mainBtnTextDisabled: mutedForeground,
    mainBtnTextOnHover: primaryForeground,
    pinDotActivated: primary,
    pinDotBase: background,
    pinDotBaseBorder: border,
    plainBtnText: foreground,
    secondBtnBgOnHover: muted,
    secondBtnBorder: border,
    secondBtnBorderOnHover: foreground,
    secondBtnText: foreground,
    success: primary,
    textAuxiliary: mutedForeground,
    textAuxiliary2: mutedForeground,
    textInteractive: foreground,
    textMain: cardForeground,
    textMain2: foreground,
    textPlaceholder: mutedForeground,
  }
}

export function SignInForm() {
  return <SignIn />
}

function SignIn() {
  const sdk = useRef<W3SSdk | null>(null)
  const { resolvedTheme } = useTheme()
  const deviceIdRef = useRef("")
  const [email, setEmail] = useState("")
  const [deviceId, setDeviceId] = useState("")
  const [ready, setReady] = useState(false)
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const appId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID

  useEffect(() => {
    if (!appId) return

    const finish = async (login: LoginResult) => {
      const response = await fetch("/api/auth/circle/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userToken: login.userToken,
          deviceId: deviceIdRef.current,
        }),
      })
      const data = (await response.json()) as {
        destination?: string
        error?: string
      }

      if (!response.ok || !data.destination) {
        setVerifying(false)
        setSent(false)
        setStatus(data.error || "Could not finish sign-in.")
        return
      }

      window.location.assign(data.destination)
    }

    const instance = new W3SSdk(
      { appSettings: { appId } },
      async (error: unknown, result: unknown) => {
        if (error) {
          setVerifying(false)
          setSent(false)
          setStatus(
            "Email verification failed. Request a new code and try again."
          )
          return
        }

        const login = result as LoginResult
        saveCircleAuthorization(login)
        const initialized = await fetch("/api/auth/circle/initialize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userToken: login.userToken }),
        })
        const initData = (await initialized.json()) as {
          challengeId?: string
          walletReady?: boolean
          error?: string
        }

        if (!initialized.ok) {
          setVerifying(false)
          setSent(false)
          setStatus(initData.error || "Could not initialize your wallet.")
          return
        }

        if (!initData.challengeId) {
          await finish(login)
          return
        }

        instance.setAuthentication({
          userToken: login.userToken,
          encryptionKey: login.encryptionKey,
        })
        instance.execute(initData.challengeId, (challengeError) => {
          if (challengeError) {
            setVerifying(false)
            setSent(false)
            setStatus("Wallet creation was not completed.")
            return
          }

          void finish(login)
        })
      }
    )

    instance.setThemeColor(circleThemeColor())
    sdk.current = instance
    void instance
      .getDeviceId()
      .then((id) => {
        deviceIdRef.current = id
        setDeviceId(id)
        setReady(true)
      })
      .catch(() => setStatus("Could not prepare secure email sign-in."))
  }, [appId])

  useEffect(() => {
    if (sdk.current && resolvedTheme) {
      sdk.current.setThemeColor(circleThemeColor())
    }
  }, [resolvedTheme])

  async function sendOtp() {
    if (!deviceId || !email || sending) return

    setStatus(null)
    setSending(true)
    try {
      const response = await fetch("/api/auth/circle/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, deviceId }),
      })
      const data = (await response.json()) as {
        deviceToken?: string
        deviceEncryptionKey?: string
        otpToken?: string
        error?: string
      }

      if (
        !response.ok ||
        !data.deviceToken ||
        !data.deviceEncryptionKey ||
        !data.otpToken
      ) {
        setStatus(data.error || "Could not send the verification code.")
        return
      }

      sdk.current?.updateConfigs({
        appSettings: { appId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID! },
        loginConfigs: {
          deviceToken: data.deviceToken,
          deviceEncryptionKey: data.deviceEncryptionKey,
          otpToken: data.otpToken,
        },
      })
      setSent(true)
    } catch {
      setStatus("Could not send the verification code.")
    } finally {
      setSending(false)
    }
  }

  function requestNewCode() {
    setSent(false)
    setVerifying(false)
    setStatus(null)
  }

  function verifyOtp() {
    setStatus(null)
    setVerifying(true)
    sdk.current?.verifyOtp()
  }

  return (
    <main className="flex min-h-[calc(100svh-4rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to CoinArc</CardTitle>
          <CardDescription>
            Sign in to create or access your CoinArc wallet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="email">Email</Label>
            <Input
              autoComplete="email"
              disabled={sent || sending || verifying}
              id="email"
              onChange={(event) => {
                setEmail(event.target.value)
                if (sent) requestNewCode()
              }}
              placeholder="you@example.com"
              type="email"
              value={email}
            />
            <p className="text-xs text-muted-foreground">
              We use your email only to verify and open your embedded CoinArc
              wallet. It is not marketing consent.
            </p>
            {sent ? (
              <>
                <Button
                  className="w-full"
                  disabled={verifying}
                  onClick={verifyOtp}
                >
                  {verifying ? "Verifying…" : "Enter verification code"}
                </Button>
                <Button
                  className="w-full"
                  disabled={verifying}
                  onClick={requestNewCode}
                  type="button"
                  variant="ghost"
                >
                  Request a new code
                </Button>
              </>
            ) : (
              <Button
                className="w-full"
                disabled={!appId || !ready || !email || sending}
                onClick={sendOtp}
              >
                {sending ? "Sending code…" : "Continue with email"}
              </Button>
            )}
          </div>
          <div className="relative text-center text-xs text-muted-foreground before:absolute before:inset-x-0 before:top-1/2 before:border-t">
            <span className="relative bg-card px-2">or</span>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Use an existing wallet</p>
            <ConnectButton showBalance={false} />
          </div>
          {!appId || status ? (
            <p className="text-sm text-destructive" role="alert">
              {status || "Email sign-in is not configured."}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  )
}

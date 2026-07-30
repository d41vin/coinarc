"use client"

import { ConnectButton } from "@rainbow-me/rainbowkit"
import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk"
import { useEffect, useRef, useState } from "react"

import { WalletProvider } from "@/components/wallet-provider"
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

type LoginResult = { userToken: string; encryptionKey: string }

export function SignInForm() {
  return (
    <WalletProvider>
      <SignIn />
    </WalletProvider>
  )
}

function SignIn() {
  const sdk = useRef<W3SSdk | null>(null)
  const deviceIdRef = useRef("")
  const [email, setEmail] = useState("")
  const [deviceId, setDeviceId] = useState("")
  const [ready, setReady] = useState(false)
  const [sent, setSent] = useState(false)
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
        setStatus(data.error || "Could not finish sign-in.")
        return
      }

      window.location.assign(data.destination)
    }

    const instance = new W3SSdk(
      { appSettings: { appId } },
      async (error: unknown, result: unknown) => {
        if (error) {
          setStatus("Email verification failed. Please try again.")
          return
        }

        const login = result as LoginResult
        const initialized = await fetch("/api/auth/circle/initialize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userToken: login.userToken }),
        })
        const initData = (await initialized.json()) as {
          challengeId?: string
          alreadyInitialized?: boolean
          error?: string
        }

        if (!initialized.ok) {
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
            setStatus("Wallet creation was not completed.")
            return
          }

          void finish(login)
        })
      }
    )

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

  async function sendOtp() {
    if (!deviceId || !email) return

    setStatus(null)
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
              id="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              type="email"
              value={email}
            />
            <p className="text-xs text-muted-foreground">
              We use your email only to verify and open your embedded CoinArc
              wallet. It is not marketing consent.
            </p>
            {sent ? (
              <Button
                className="w-full"
                onClick={() => sdk.current?.verifyOtp()}
              >
                Enter verification code
              </Button>
            ) : (
              <Button
                className="w-full"
                disabled={!appId || !ready || !email}
                onClick={sendOtp}
              >
                Continue with email
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

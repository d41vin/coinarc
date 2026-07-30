"use client"

import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react"
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

function useCoinArcAuth() {
  const [isLoading, setLoading] = useState(true)
  const [isAuthenticated, setAuthenticated] = useState(false)

  const fetchAccessToken = useCallback(async () => {
    const response = await fetch("/api/auth/access-token", {
      cache: "no-store",
    })
    if (!response.ok) return null
    const payload = (await response.json()) as { token?: unknown }
    return typeof payload.token === "string" ? payload.token : null
  }, [])

  useEffect(() => {
    let active = true

    void fetchAccessToken()
      .then((token) => {
        if (!active) return
        setAuthenticated(token !== null)
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setAuthenticated(false)
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [fetchAccessToken])

  return useMemo(
    () => ({ isLoading, isAuthenticated, fetchAccessToken }),
    [fetchAccessToken, isAuthenticated, isLoading]
  )
}

export function CoinArcConvexProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useCoinArcAuth}>
      {children}
    </ConvexProviderWithAuth>
  )
}

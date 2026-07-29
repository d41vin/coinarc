"use client"
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react"
import { useCallback, useEffect, useState, type ReactNode } from "react"
const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
function useCoinArcAuth() { const [isLoading, setLoading] = useState(true); const [isAuthenticated, setAuthenticated] = useState(false); useEffect(() => { void fetch("/api/auth/access-token").then((response) => { setAuthenticated(response.ok); setLoading(false) }).catch(() => { setAuthenticated(false); setLoading(false) }) }, []); const fetchAccessToken = useCallback(async () => { const response = await fetch("/api/auth/access-token"); if (!response.ok) return null; return (await response.json() as { token: string }).token }, []); return { isLoading, isAuthenticated, fetchAccessToken } }
export function CoinArcConvexProvider({ children }: { children: ReactNode }) { return <ConvexProviderWithAuth client={convex} useAuth={useCoinArcAuth}>{children}</ConvexProviderWithAuth> }

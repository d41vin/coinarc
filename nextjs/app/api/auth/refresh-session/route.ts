import { NextResponse } from "next/server"
import { getSession, sessionCookie } from "@/lib/auth"
import { sessionState } from "@/lib/convex-server"
export async function POST() { const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const user = await sessionState(session); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const response = NextResponse.json({ onboardingComplete: user.onboardingComplete }); response.cookies.set(sessionCookie({ ...session, onboardingComplete: user.onboardingComplete })); return response }

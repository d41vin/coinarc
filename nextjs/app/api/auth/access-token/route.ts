import { NextResponse } from "next/server"
import { getSession, signJwt } from "@/lib/auth"
export async function GET() { const session = await getSession(); return session ? NextResponse.json({ token: signJwt(session, "convex", 5 * 60) }) : NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

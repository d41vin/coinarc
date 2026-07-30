import { NextRequest, NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { searchPublicProfiles } from "@/lib/convex-server"

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session || !session.onboardingComplete) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? ""
  if (query.length > 80) {
    return NextResponse.json(
      { error: "Search term is too long" },
      { status: 400 }
    )
  }

  try {
    const results = await searchPublicProfiles(session, query)
    return NextResponse.json({ results })
  } catch {
    return NextResponse.json(
      { error: "Could not search people. Please try again." },
      { status: 500 }
    )
  }
}

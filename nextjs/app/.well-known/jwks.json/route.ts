import { NextResponse } from "next/server"
import { publicJwk } from "@/lib/auth"
export async function GET() { return NextResponse.json({ keys: [publicJwk()] }) }

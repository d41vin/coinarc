import { NextResponse } from "next/server"

export async function GET() {
  const issuer = process.env.COINARC_AUTH_ISSUER?.replace(/\/$/, "")
  if (!issuer) return NextResponse.json({ error: "Auth issuer is not configured" }, { status: 500 })
  return NextResponse.json({ issuer, jwks_uri: `${issuer}/.well-known/jwks.json`, response_types_supported: ["token"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"] })
}

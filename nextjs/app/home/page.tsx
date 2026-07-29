import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
export default async function HomePage() { const session = await getSession(); if (!session) redirect("/sign-in"); if (!session.onboardingComplete) redirect("/onboarding"); return <main className="flex min-h-svh items-center justify-center p-6"><div className="max-w-md text-center"><h1 className="text-2xl font-semibold">CoinArc is ready</h1><p className="mt-2 text-muted-foreground">Your authenticated home will arrive here next.</p></div></main> }

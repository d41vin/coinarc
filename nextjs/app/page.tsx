import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
export default async function Page() { const session = await getSession(); redirect(!session ? "/sign-in" : session.onboardingComplete ? "/home" : "/onboarding") }

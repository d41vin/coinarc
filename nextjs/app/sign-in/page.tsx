import { redirect } from "next/navigation"

import { getSession } from "@/lib/auth"
import { SignInForm } from "./sign-in-form"

export default async function SignInPage() {
  const session = await getSession()

  if (session) {
    redirect(session.onboardingComplete ? "/home" : "/onboarding")
  }

  return <SignInForm />
}

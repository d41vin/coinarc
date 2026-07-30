import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { getSession } from "@/lib/auth"

export default async function Page() {
  const session = await getSession()
  const cta = !session
    ? { href: "/sign-in", label: "Sign in" }
    : session.onboardingComplete
      ? { href: "/home", label: "Open CoinArc" }
      : { href: "/onboarding", label: "Resume setup" }

  return (
    <main className="flex min-h-[calc(100svh-4rem)] items-center px-4 py-16 sm:px-6">
      <section className="mx-auto w-full max-w-2xl text-center">
        <p className="text-sm font-medium text-muted-foreground">
          Payments for your people and communities
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-6xl">
          Move money together with CoinArc.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
          A simpler home for personal payments, groups, merchants, and the
          onchain tools that connect them.
        </p>
        <div className="mt-8 flex justify-center">
          <Link className={buttonVariants({ size: "lg" })} href={cta.href}>
            {cta.label}
          </Link>
        </div>
      </section>
    </main>
  )
}

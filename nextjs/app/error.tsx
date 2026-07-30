"use client"

import Link from "next/link"
import { useEffect } from "react"

import { Button } from "@/components/ui/button"

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error("CoinArc route error", error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-2xl items-center p-4 sm:p-6">
      <section className="w-full rounded-4xl border bg-card p-6 text-card-foreground shadow-md ring-1 ring-foreground/5 sm:p-8">
        <p className="text-sm font-medium text-muted-foreground">
          We could not load this page
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Let&apos;s try that again.
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
          Your account and changes are safe. Retry this page, or return home if
          the connection is still recovering.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => unstable_retry()} type="button">
            Try again
          </Button>
          <Button render={<Link href="/home" />} variant="outline">
            Go home
          </Button>
        </div>
      </section>
    </main>
  )
}

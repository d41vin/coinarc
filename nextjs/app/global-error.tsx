"use client"

import { useEffect } from "react"

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error("CoinArc root error", error)
  }, [error])

  return (
    <html lang="en">
      <body>
        <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
          <section className="w-full max-w-md rounded-4xl border bg-card p-6 text-card-foreground shadow-md ring-1 ring-foreground/5">
            <p className="text-sm font-medium text-muted-foreground">
              CoinArc needs to reconnect
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Let&apos;s get you back in.
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Your account and changes are safe. Try reloading this page.
            </p>
            <button
              className="mt-6 inline-flex h-9 items-center justify-center rounded-4xl bg-primary px-3 text-sm font-medium text-primary-foreground"
              onClick={() => unstable_retry()}
              type="button"
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  )
}

"use client"

import Link from "next/link"
import { Check, Copy, Share2, WalletCards } from "lucide-react"
import { useState, useSyncExternalStore } from "react"
import { QRCode } from "react-qrcode-logo"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type ActionStatus = "idle" | "copied" | "copy-error" | "share-error"

const emptySubscribe = () => () => {}

export function ReceiveDialog({
  address,
  onOpenChange,
  open,
}: {
  address?: string
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const [actionStatus, setActionStatus] = useState<ActionStatus>("idle")
  const canShare = useSyncExternalStore(
    emptySubscribe,
    () => typeof navigator.share === "function",
    () => false
  )

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setActionStatus("idle")
    onOpenChange(nextOpen)
  }

  async function copyAddress() {
    if (!address) return

    try {
      await navigator.clipboard.writeText(address)
      setActionStatus("copied")
    } catch {
      setActionStatus("copy-error")
    }
  }

  async function shareAddress() {
    if (!address || typeof navigator.share !== "function") return

    try {
      await navigator.share({
        title: "Receive USDC on CoinArc",
        text: `Send USDC on Arc Testnet to ${address}`,
      })
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) {
        setActionStatus("share-error")
      }
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="gap-5 sm:max-w-md">
        {address ? (
          <>
            <DialogHeader className="pr-10 text-center sm:items-center">
              <DialogTitle className="text-xl">Receive USDC</DialogTitle>
              <DialogDescription>
                Scan this code or copy your address to get paid.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="mx-auto w-fit rounded-4xl border bg-white p-3 shadow-sm dark:bg-white">
                <QRCode
                  bgColor="#ffffff"
                  ecLevel="M"
                  fgColor="#111111"
                  id="coinarc-receive-qr-code"
                  quietZone={12}
                  size={196}
                  value={address}
                />
              </div>

              <p className="text-center text-sm font-medium">
                Arc Testnet <span aria-hidden="true">&middot;</span> USDC
              </p>

              <div className="rounded-3xl border bg-muted/40 p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Your primary receiving wallet
                </p>
                <code className="mt-2 block font-mono text-sm leading-6 break-all text-foreground">
                  {address}
                </code>
              </div>

              <div className={canShare ? "grid gap-2 sm:grid-cols-2" : "flex"}>
                <Button
                  className={canShare ? undefined : "w-full"}
                  onClick={() => void copyAddress()}
                  type="button"
                >
                  {actionStatus === "copied" ? <Check /> : <Copy />}
                  {actionStatus === "copied" ? "Copied" : "Copy address"}
                </Button>
                {canShare ? (
                  <Button
                    onClick={() => void shareAddress()}
                    type="button"
                    variant="outline"
                  >
                    <Share2 />
                    Share details
                  </Button>
                ) : null}
              </div>

              <p
                aria-live="polite"
                className="text-center text-xs leading-5 text-muted-foreground"
                role="status"
              >
                {actionStatus === "copy-error"
                  ? "Could not copy your address. Please select and copy it manually."
                  : actionStatus === "share-error"
                    ? "Could not share your payment details. Please try again."
                    : "Only send USDC on Arc Testnet."}
              </p>
            </div>
          </>
        ) : (
          <>
            <DialogHeader className="pr-10">
              <DialogTitle className="text-xl">
                Set up a receiving wallet
              </DialogTitle>
              <DialogDescription>
                Add or choose a primary wallet before sharing payment details.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-3xl border border-dashed bg-muted/40 p-5 text-center">
              <WalletCards className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                Your primary receiving wallet will appear here once it is set
                up.
              </p>
            </div>

            <Button className="w-full" render={<Link href="/settings" />}>
              Go to settings
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

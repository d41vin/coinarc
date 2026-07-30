"use client"

import { useState } from "react"
import { useMutation } from "convex/react"
import { makeFunctionReference } from "convex/server"
import { genUploader } from "uploadthing/client"
import type { OurFileRouter } from "@/app/api/uploadthing/core"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PROFILE_PHOTO_MAX_BYTES, PROFILE_PHOTO_MAX_LABEL, PROFILE_PHOTO_MIME_TYPES } from "@/lib/profile-photo"

const upload = genUploader<OurFileRouter>({ url: "/api/uploadthing" })
const completeOnboarding = makeFunctionReference<"mutation">("users:completeOnboarding")

function profilePhotoError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : ""

  if (/(size|too large|exceeds|limit)/i.test(message)) {
    return `This profile photo is larger than ${PROFILE_PHOTO_MAX_LABEL}. Choose a smaller image and try again.`
  }

  if (/(type|format|jpeg|png|webp|animated)/i.test(message)) {
    return "Choose a JPEG, PNG, or non-animated WebP profile photo."
  }

  return "Profile photo upload failed. Check your connection and try again."
}

export function OnboardingForm() {
  const complete = useMutation(completeOnboarding)
  const [displayName, setDisplayName] = useState("")
  const [username, setUsername] = useState("")
  const [avatarUrl, setAvatarUrl] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const initials = displayName.trim().split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase() || "?"

  async function choosePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!PROFILE_PHOTO_MIME_TYPES.includes(file.type as typeof PROFILE_PHOTO_MIME_TYPES[number])) {
      setError("Choose a JPEG, PNG, or non-animated WebP profile photo.")
      return
    }

    if (file.size > PROFILE_PHOTO_MAX_BYTES) {
      setError(`This profile photo is larger than ${PROFILE_PHOTO_MAX_LABEL}. Choose a smaller image and try again.`)
      return
    }

    setBusy(true)
    setError(undefined)

    try {
      const result = await upload.uploadFiles("profilePhoto", { files: [file] })
      const uploaded = result[0]
      const url = uploaded?.serverData?.url ?? uploaded?.ufsUrl
      if (!url) throw new Error("Upload did not return a profile photo")
      setAvatarUrl(url)
    } catch (reason) {
      setError(profilePhotoError(reason))
    } finally {
      setBusy(false)
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(undefined)

    try {
      await complete({ displayName, username })
      const response = await fetch("/api/auth/refresh-session", { method: "POST" })
      if (!response.ok) throw new Error("Could not refresh your session.")
      window.location.assign("/home")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not complete onboarding.")
    } finally {
      setBusy(false)
    }
  }

  return <main className="flex min-h-svh items-center justify-center p-4"><Card className="w-full max-w-md"><CardHeader><CardTitle>Set up your profile</CardTitle><CardDescription>Your display name and CoinArc username are required to continue.</CardDescription></CardHeader><CardContent><form className="space-y-5" onSubmit={submit}><div className="flex items-center gap-4"><Avatar size="lg" className="size-16"><AvatarImage src={avatarUrl} /><AvatarFallback className="bg-primary text-primary-foreground text-lg">{initials}</AvatarFallback></Avatar><div className="space-y-2"><Label htmlFor="avatar">Profile photo <span className="text-muted-foreground">(optional)</span></Label><Input id="avatar" type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} disabled={busy} /><p className="text-xs text-muted-foreground">JPEG, PNG, or WebP. Max {PROFILE_PHOTO_MAX_LABEL}.</p></div></div><div className="space-y-2"><Label htmlFor="displayName">Display name</Label><Input id="displayName" value={displayName} onChange={(event) => { setDisplayName(event.target.value); if (!username) setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 20)) }} required maxLength={80} /></div><div className="space-y-2"><Label htmlFor="username">Username</Label><Input id="username" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} required minLength={4} maxLength={20} pattern="[a-z0-9][a-z0-9_]{2,18}[a-z0-9]" /><p className="text-xs text-muted-foreground">4–20 lowercase letters, numbers, or underscores. Start and end with a letter or number; no consecutive underscores.</p></div>{error && <p className="text-sm text-destructive" role="alert">{error}</p>}<Button className="w-full" type="submit" disabled={busy}>{busy ? "Saving…" : "Complete setup"}</Button></form></CardContent></Card></main>
}

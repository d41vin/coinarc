"use client"

import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { makeFunctionReference } from "convex/server"
import { genUploader } from "uploadthing/client"
import { useRouter } from "next/navigation"

import type { OurFileRouter } from "@/app/api/uploadthing/core"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  PROFILE_PHOTO_MAX_BYTES,
  PROFILE_PHOTO_MAX_LABEL,
  PROFILE_PHOTO_MIME_TYPES,
} from "@/lib/profile-photo"
import type { Doc, Id } from "@/convex/_generated/dataModel"

const upload = genUploader<OurFileRouter>({ url: "/api/uploadthing" })
type SettingsData = { user: Doc<"users">; wallets: Doc<"wallets">[] } | null
const settings = makeFunctionReference<
  "query",
  Record<string, never>,
  SettingsData
>("users:settings")
const updateProfile = makeFunctionReference<
  "mutation",
  { displayName: string; username: string }
>("users:updateProfile")
const setPrimaryReceivingWallet = makeFunctionReference<
  "mutation",
  { walletId: Id<"wallets"> }
>("users:setPrimaryReceivingWallet")

type SettingsFormProps = { email?: string }

function initials(displayName: string | undefined) {
  return (
    displayName
      ?.trim()
      .split(/\s+/)
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  )
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function profilePhotoError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : ""
  if (/(size|too large|exceeds|limit)/i.test(message))
    return `This profile photo is larger than ${PROFILE_PHOTO_MAX_LABEL}. Choose a smaller image and try again.`
  if (/(type|format|jpeg|png|webp|animated)/i.test(message))
    return "Choose a JPEG, PNG, or non-animated WebP profile photo."
  return "Profile photo upload failed. Check your connection and try again."
}

export function SettingsForm({ email }: SettingsFormProps) {
  const data = useQuery(settings)

  if (data === undefined) {
    return (
      <main className="mx-auto min-h-[calc(100svh-4rem)] w-full max-w-2xl p-4 sm:p-6">
        <p className="text-sm text-muted-foreground">Loading settings…</p>
      </main>
    )
  }

  if (data === null) {
    return (
      <main className="mx-auto min-h-[calc(100svh-4rem)] w-full max-w-2xl p-4 sm:p-6">
        <p className="text-sm text-destructive" role="alert">
          Your account details could not be loaded. Refresh and try again.
        </p>
      </main>
    )
  }

  return <SettingsContent data={data} email={email} key={data.user._id} />
}

function SettingsContent({
  data,
  email,
}: SettingsFormProps & { data: Exclude<SettingsData, null> }) {
  const router = useRouter()
  const saveProfile = useMutation(updateProfile)
  const setPrimary = useMutation(setPrimaryReceivingWallet)
  const [displayName, setDisplayName] = useState(data.user.displayName ?? "")
  const [username, setUsername] = useState(data.user.username ?? "")
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState<string>()
  const [profileStatus, setProfileStatus] = useState<string>()
  const [isPhotoUploading, setIsPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string>()
  const [photoStatus, setPhotoStatus] = useState<string>()
  const [walletError, setWalletError] = useState<string>()
  const [updatingWalletId, setUpdatingWalletId] = useState<string>()

  const { user, wallets } = data

  async function choosePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setPhotoError(undefined)
    setPhotoStatus(undefined)
    if (
      !PROFILE_PHOTO_MIME_TYPES.includes(
        file.type as (typeof PROFILE_PHOTO_MIME_TYPES)[number]
      )
    ) {
      setPhotoError("Choose a JPEG, PNG, or non-animated WebP profile photo.")
      return
    }
    if (file.size > PROFILE_PHOTO_MAX_BYTES) {
      setPhotoError(
        `This profile photo is larger than ${PROFILE_PHOTO_MAX_LABEL}. Choose a smaller image and try again.`
      )
      return
    }

    setIsPhotoUploading(true)
    try {
      const result = await upload.uploadFiles("profilePhoto", { files: [file] })
      const uploaded = result[0]
      if (!uploaded?.serverData?.url && !uploaded?.ufsUrl)
        throw new Error("Upload did not return a profile photo")
      setPhotoStatus("Profile photo updated.")
      router.refresh()
    } catch (reason) {
      setPhotoError(profilePhotoError(reason))
    } finally {
      setIsPhotoUploading(false)
    }
  }

  async function submitProfile(event: React.FormEvent) {
    event.preventDefault()
    setSavingProfile(true)
    setProfileError(undefined)
    setProfileStatus(undefined)
    try {
      await saveProfile({ displayName, username })
      setProfileStatus("Profile saved.")
      router.refresh()
    } catch (reason) {
      setProfileError(
        reason instanceof Error
          ? reason.message
          : "Could not save your profile."
      )
    } finally {
      setSavingProfile(false)
    }
  }

  async function makePrimary(walletId: string) {
    setUpdatingWalletId(walletId)
    setWalletError(undefined)
    try {
      await setPrimary({ walletId: walletId as Id<"wallets"> })
    } catch (reason) {
      setWalletError(
        reason instanceof Error
          ? reason.message
          : "Could not update the receiving wallet."
      )
    } finally {
      setUpdatingWalletId(undefined)
    }
  }

  return (
    <main className="mx-auto min-h-[calc(100svh-4rem)] w-full max-w-2xl p-4 sm:p-6">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-muted-foreground">
            Manage your CoinArc profile and receiving wallet.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Choose how people see you on CoinArc.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={submitProfile}>
              <div className="flex items-center gap-4">
                <Avatar className="size-16" size="lg">
                  {user.avatarUrl ? (
                    <AvatarImage alt="" src={user.avatarUrl} />
                  ) : null}
                  <AvatarFallback className="bg-primary text-lg text-primary-foreground">
                    {initials(user.displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-2">
                  <Label htmlFor="avatar">Profile photo</Label>
                  <Input
                    accept="image/jpeg,image/png,image/webp"
                    disabled={isPhotoUploading}
                    id="avatar"
                    onChange={choosePhoto}
                    type="file"
                  />
                  <p className="text-xs text-muted-foreground">
                    JPEG, PNG, or non-animated WebP. Max{" "}
                    {PROFILE_PHOTO_MAX_LABEL}.
                  </p>
                  {isPhotoUploading ? (
                    <p className="text-xs text-muted-foreground" role="status">
                      Uploading profile photo…
                    </p>
                  ) : null}
                  {photoStatus ? (
                    <p className="text-xs text-muted-foreground" role="status">
                      {photoStatus}
                    </p>
                  ) : null}
                  {photoError ? (
                    <p className="text-xs text-destructive" role="alert">
                      {photoError}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="display-name">Display name</Label>
                <Input
                  id="display-name"
                  maxLength={80}
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                  value={displayName}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  maxLength={20}
                  minLength={4}
                  onChange={(event) =>
                    setUsername(event.target.value.toLowerCase())
                  }
                  pattern="[a-z0-9][a-z0-9_]{2,18}[a-z0-9]"
                  required
                  value={username}
                />
                <p className="text-xs text-muted-foreground">
                  4–20 lowercase letters, numbers, or underscores. Start and end
                  with a letter or number; no consecutive underscores.
                </p>
              </div>
              {email ? (
                <p className="text-sm text-muted-foreground">
                  Verified email: {email}
                </p>
              ) : null}
              {profileError ? (
                <p className="text-sm text-destructive" role="alert">
                  {profileError}
                </p>
              ) : null}
              {profileStatus ? (
                <p className="text-sm text-muted-foreground" role="status">
                  {profileStatus}
                </p>
              ) : null}
              <Button
                disabled={savingProfile || isPhotoUploading}
                type="submit"
              >
                {savingProfile ? "Saving…" : "Save profile"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Receiving wallets</CardTitle>
            <CardDescription>
              Payments sent to your CoinArc profile use your primary receiving
              wallet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {wallets.map((wallet) => (
              <div
                className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                key={wallet._id}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">
                      {wallet.custody === "circle"
                        ? "CoinArc wallet"
                        : "External wallet"}
                    </p>
                    {wallet.primaryReceiving ? <Badge>Primary</Badge> : null}
                  </div>
                  <p className="truncate font-mono text-sm text-muted-foreground">
                    {shortAddress(wallet.address)}
                  </p>
                </div>
                {wallet.primaryReceiving ? (
                  <Button disabled size="sm" variant="secondary">
                    Primary receiving wallet
                  </Button>
                ) : (
                  <Button
                    disabled={updatingWalletId === wallet._id}
                    onClick={() => void makePrimary(wallet._id)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    {updatingWalletId === wallet._id
                      ? "Updating…"
                      : "Make primary"}
                  </Button>
                )}
              </div>
            ))}
            {wallets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No verified receiving wallet is available yet. Sign out and sign
                in again to refresh your wallet connection.
              </p>
            ) : null}
            {walletError ? (
              <p className="text-sm text-destructive" role="alert">
                {walletError}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

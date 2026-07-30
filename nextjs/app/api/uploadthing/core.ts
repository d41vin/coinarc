import { createUploadthing, type FileRouter } from "uploadthing/next"
import { getSession } from "@/lib/auth"
import { saveAvatarForSession } from "@/lib/convex-server"
import { PROFILE_PHOTO_MIME_TYPES, PROFILE_PHOTO_UPLOADTHING_MAX_SIZE } from "@/lib/profile-photo"
const f = createUploadthing()
const allowedMimeTypes = new Set<string>(PROFILE_PHOTO_MIME_TYPES)
function isAnimatedImage(bytes: Uint8Array, type: string) {
  const content = new TextDecoder().decode(bytes)
  return (type === "image/png" && content.includes("acTL")) || (type === "image/webp" && content.includes("ANIM"))
}
export const ourFileRouter = { profilePhoto: f({ image: { maxFileSize: PROFILE_PHOTO_UPLOADTHING_MAX_SIZE, maxFileCount: 1 } }).middleware(async () => { const session = await getSession(); if (!session) throw new Error("Unauthorized"); return { session } }).onUploadComplete(async ({ metadata, file }) => { if (!allowedMimeTypes.has(file.type) || file.type === "image/svg+xml" || file.type === "image/gif") throw new Error("Only JPEG, PNG, and non-animated WebP profile photos are accepted")
  const uploaded = await fetch(file.ufsUrl)
  if (!uploaded.ok) throw new Error("Could not inspect uploaded profile photo")
  const bytes = new Uint8Array(await uploaded.arrayBuffer())
  if (isAnimatedImage(bytes, file.type)) throw new Error("Animated profile photos are not accepted")
  await saveAvatarForSession(metadata.session, file.ufsUrl, file.key); return { url: file.ufsUrl } }) } satisfies FileRouter
export type OurFileRouter = typeof ourFileRouter

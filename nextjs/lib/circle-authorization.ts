"use client"

const STORAGE_KEY = "coinarc.circle-authorization.v1"

export type CircleAuthorization = {
  userToken: string
  encryptionKey: string
  refreshToken?: string
}

function browserStorage() {
  if (typeof window === "undefined") return null
  return window.sessionStorage
}

export function saveCircleAuthorization(authorization: CircleAuthorization) {
  browserStorage()?.setItem(STORAGE_KEY, JSON.stringify(authorization))
}

export function readCircleAuthorization(): CircleAuthorization | null {
  const value = browserStorage()?.getItem(STORAGE_KEY)
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as { userToken?: unknown }).userToken !== "string" ||
      typeof (parsed as { encryptionKey?: unknown }).encryptionKey !== "string"
    ) {
      return null
    }
    return {
      userToken: (parsed as { userToken: string }).userToken,
      encryptionKey: (parsed as { encryptionKey: string }).encryptionKey,
      ...(typeof (parsed as { refreshToken?: unknown }).refreshToken ===
      "string"
        ? { refreshToken: (parsed as { refreshToken: string }).refreshToken }
        : {}),
    }
  } catch {
    return null
  }
}

export function clearCircleAuthorization() {
  browserStorage()?.removeItem(STORAGE_KEY)
}

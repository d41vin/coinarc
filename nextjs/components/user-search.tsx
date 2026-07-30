"use client"

import { Search, UserRound } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

type SearchResult = {
  displayName: string
  username: string
  avatarUrl?: string
}

const minimumQueryLength = 2

function initials(displayName: string) {
  return displayName
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function UserSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle")

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) setQuery("")
  }

  useEffect(() => {
    const searchTerm = query.trim()
    if (searchTerm.length < minimumQueryLength) {
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      setStatus("loading")
      try {
        const response = await fetch(
          `/api/users/search?q=${encodeURIComponent(searchTerm)}`,
          { signal: controller.signal }
        )
        if (!response.ok) throw new Error("Search failed")
        const data = (await response.json()) as { results: SearchResult[] }
        setResults(data.results)
        setStatus("idle")
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        setResults([])
        setStatus("error")
      }
    }, 200)

    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [query])

  function selectUser(username: string) {
    setOpen(false)
    setQuery("")
    router.push(`/profile/${username}`)
  }

  return (
    <>
      <Button
        aria-label="Find people"
        onClick={() => setOpen(true)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Search />
      </Button>
      <CommandDialog
        aria-label="Find people"
        className="top-0 h-dvh max-w-none translate-y-0 rounded-none sm:top-1/3 sm:h-auto sm:max-w-md sm:rounded-4xl"
        onOpenChange={handleOpenChange}
        open={open}
        showCloseButton
      >
        <Command shouldFilter={false}>
          <CommandInput
            autoFocus
            onValueChange={setQuery}
            placeholder="Search by username or name"
            value={query}
          />
          <CommandList className="max-h-none sm:max-h-72">
            {query.trim().length < minimumQueryLength ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Type at least {minimumQueryLength} characters to find people.
              </p>
            ) : status === "loading" ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Searching people...
              </p>
            ) : status === "error" ? (
              <p
                className="px-4 py-8 text-center text-sm text-muted-foreground"
                role="alert"
              >
                Search is unavailable. Please try again.
              </p>
            ) : results.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No people found for &ldquo;{query.trim()}&rdquo;.
              </p>
            ) : (
              <CommandGroup heading="People">
                {results.map((person) => (
                  <CommandItem
                    key={person.username}
                    onSelect={() => selectUser(person.username)}
                    value={`${person.displayName} ${person.username}`}
                  >
                    <Avatar>
                      {person.avatarUrl ? (
                        <AvatarImage alt="" src={person.avatarUrl} />
                      ) : null}
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {initials(person.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {person.displayName}
                      </span>
                      <span className="block truncate text-xs font-normal text-muted-foreground">
                        @{person.username}
                      </span>
                    </span>
                    <UserRound className="text-muted-foreground" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}

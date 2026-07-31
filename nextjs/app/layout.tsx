import { Geist_Mono, Inter } from "next/font/google"

import "@/styles/globals.css"
import { CoinArcConvexProvider } from "@/components/convex-provider"
import { SiteHeader } from "@/components/site-header"
import { ThemeProvider } from "@/components/theme-provider"
import { WalletProvider } from "@/components/wallet-provider"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable
      )}
    >
      <body>
        <ThemeProvider>
          <WalletProvider>
            <CoinArcConvexProvider>
              <SiteHeader />
              {children}
            </CoinArcConvexProvider>
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

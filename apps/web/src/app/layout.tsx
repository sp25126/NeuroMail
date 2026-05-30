import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Providers } from "./providers"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "AI Mail App",
  description: "Premium AI-powered email client",
}

import { Toaster } from "sonner"
import { Toaster as CustomToaster } from "@/components/ui/toaster"
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased`}>
        <Providers>
          <KeyboardShortcuts />
          {children}
          <Toaster position="top-center" theme="dark" richColors />
          <CustomToaster />
        </Providers>
      </body>
    </html>
  )
}

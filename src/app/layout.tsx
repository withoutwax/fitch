import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { NavBar } from "@/components/NavBar";
import { SITE } from "@/lib/site";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const logicMono = JetBrains_Mono({
  variable: "--font-logic-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fitch — natural deduction practice",
  description: "Solve Fitch-style natural deduction proofs and track your progress.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${logicMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <AuthProvider>
          <NavBar />
          <main className="flex flex-1 flex-col">{children}</main>
          <footer className="border-t border-line">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-5 text-xs text-muted">
              <span>© 2026 {SITE.name}</span>
              <Link href="/privacy" className="hover:text-text">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-text">
                Terms of Service
              </Link>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}

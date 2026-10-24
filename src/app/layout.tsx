import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { NavBar } from "@/components/NavBar";
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
        </AuthProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "émile marcel agustín — Trust Resolution Layer",
  description:
    "Deliberate legibility as a stack. Verifiable agent identity, capability discovery, and version integrity anchored to ENS.",
  openGraph: {
    title: "émile marcel agustín",
    description: "Trust Resolution Layer — deliberate legibility anchored to ENS.",
    siteName: "emilemarcelagustin.eth",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "émile marcel agustín",
    description: "Trust Resolution Layer — deliberate legibility anchored to ENS.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[var(--color-surface)] text-[var(--color-ink)]">
        <Sidebar />
        <main className="md:ml-64 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}

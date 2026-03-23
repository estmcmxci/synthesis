import type { Metadata } from "next";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "emilemarcelagustin.eth — Trust Resolution Layer",
  description:
    "Deliberate legibility as a stack. Verifiable agent identity, capability discovery, and version integrity anchored to ENS.",
  openGraph: {
    title: "emilemarcelagustin.eth",
    description: "Trust Resolution Layer — deliberate legibility anchored to ENS.",
    siteName: "emilemarcelagustin.eth",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "emilemarcelagustin.eth",
    description: "Trust Resolution Layer — deliberate legibility anchored to ENS.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "emilemarcelagustin.eth",
  url: "https://emilemarcelagustin.eth.limo",
  sameAs: [
    "https://app.ens.domains/emilemarcelagustin.eth",
  ],
  identifier: {
    "@type": "PropertyValue",
    name: "ENS Name",
    value: "emilemarcelagustin.eth",
  },
  knowsAbout: [
    "Trust Resolution Layer",
    "ENS",
    "ENSIP-25",
    "ENSIP-26",
    "ERC-8004",
    "Agent Identity Profile",
    "World ID",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <link
          rel="alternate"
          type="text/markdown"
          href="/skill.md"
          title="SKILL.md — machine-readable capabilities"
        />
      </head>
      <body className="bg-[var(--color-surface)] text-[var(--color-ink)]">
        <Sidebar />
        <main className="md:ml-64 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}

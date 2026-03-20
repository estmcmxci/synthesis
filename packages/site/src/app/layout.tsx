import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Synthesis — Trust Resolution Layer",
  description: "Verifiable agent identity, capability discovery, and version integrity anchored to ENS.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

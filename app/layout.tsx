import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VibeGuard",
  description: "Proof-of-strategy trading agent for Bitget AI Base Camp.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

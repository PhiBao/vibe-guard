import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VibeGuard",
  description: "Regime-aware trading agent for Bitget USDT futures.",
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

import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";

import "./globals.css";

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display",
});

const sans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Alexandru & Elisabeta — Încărcare fotografii",
  description:
    "Împărtășește momentele tale preferate de la nunta noastră.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ro" className={`${display.variable} h-full`}>
      <body
        className={`${sans.className} min-h-full bg-background text-text antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

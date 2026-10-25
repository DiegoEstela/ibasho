import type { Metadata, Viewport } from "next";
import { Zen_Maru_Gothic } from "next/font/google";
import "./globals.css";

const zenMaru = Zen_Maru_Gothic({
  variable: "--font-zen-maru",
  weight: ["400", "500", "700"],
  // Los kanji se cargan bajo demanda por unicode-range; solo se precarga latin.
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ibasho 居場所",
  description: "La vida en pareja, en casa.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f0e1" },
    { media: "(prefers-color-scheme: dark)", color: "#11192b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${zenMaru.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Klee_One, Zen_Maru_Gothic } from "next/font/google";
import { RegisterServiceWorker } from "@/components/pwa/RegisterServiceWorker";
import "./globals.css";

const zenMaru = Zen_Maru_Gothic({
  variable: "--font-zen-maru",
  weight: ["400", "500", "700"],
  // Los kanji se cargan bajo demanda por unicode-range; solo se precarga latin.
  subsets: ["latin"],
  display: "swap",
});

// Letra manuscrita de papelería japonesa, solo para el texto de las notitas.
const kleeOne = Klee_One({
  variable: "--font-klee",
  weight: ["400", "600"],
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ibasho 居場所",
  description: "La vida en pareja, en casa.",
  applicationName: "Ibasho",
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "Ibasho", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f0e1" },
    { media: "(prefers-color-scheme: dark)", color: "#11192b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${zenMaru.variable} ${kleeOne.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import "./globals.css";

const publicSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(publicSiteUrl),
  title: {
    default: "Mesa Certa — Copilot de Poker",
    template: "%s · Mesa Certa",
  },
  description:
    "Treinador, calculadora e apoio à decisão para partidas presenciais de Texas Hold’em.",
  applicationName: "Mesa Certa",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Mesa Certa",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192" }],
  },
  openGraph: {
    title: "Mesa Certa — Decida. Aprenda. Evolua.",
    description:
      "Seu treinador e Copilot para partidas presenciais de Texas Hold’em.",
    type: "website",
    locale: "pt_BR",
    siteName: "Mesa Certa",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Mesa Certa — Decida. Aprenda. Evolua.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mesa Certa — Decida. Aprenda. Evolua.",
    description:
      "Seu treinador e Copilot para partidas presenciais de Texas Hold’em.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#071612",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

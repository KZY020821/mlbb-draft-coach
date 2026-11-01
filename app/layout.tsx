import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "MLBB Draft Coach",
  description: "Enter the bans and picks from a Mobile Legends draft and get the best last pick or two for your team.",
  applicationName: "MLBB Draft Coach",
  // Installed on iPhone/iPad: full screen, dark status bar, home-screen name and icon.
  appleWebApp: { capable: true, title: "Draft Coach", statusBarStyle: "black" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  // Link previews on Discord, Facebook, WhatsApp and X (the image is app/opengraph-image.tsx).
  openGraph: {
    type: "website",
    siteName: "MLBB Draft Coach",
    title: "MLBB Draft Coach",
    description: "AI draft suggestions for Mobile Legends, from MPL Indonesia, Philippines and Malaysia pro drafts.",
    url: "/"
  },
  twitter: { card: "summary_large_image" }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#070b16"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        {children}
        {/* Page views and loading speed, without cookies. Turn them on in the Vercel dashboard (Analytics, Speed Insights). */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

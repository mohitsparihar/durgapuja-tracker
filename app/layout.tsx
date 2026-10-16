import type { Metadata, Viewport } from "next";
import { Hind, Yatra_One } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { SwRegister } from "@/components/SwRegister";

const hind = Hind({
  variable: "--font-hind",
  subsets: ["latin", "devanagari"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Display face — used ONLY for the wordmark.
const yatra = Yatra_One({
  variable: "--font-yatra",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pandal Hop — find Durga Puja pandals near you",
  description:
    "Find Durga Puja and Navratri pandals near you, see how crowded they are right now, and share photos.",
  manifest: "/manifest.webmanifest",
  applicationName: "Pandal Hop",
  appleWebApp: { capable: true, title: "Pandal Hop", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1e1b4b",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${hind.variable} ${yatra.variable} antialiased`}>
        <AuthProvider>{children}</AuthProvider>
        <SwRegister />
      </body>
    </html>
  );
}

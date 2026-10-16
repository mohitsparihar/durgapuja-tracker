import type { Metadata, Viewport } from "next";
import { Hind, Hind_Siliguri, Yatra_One } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
import { SwRegister } from "@/components/SwRegister";

const hind = Hind({
  variable: "--font-hind",
  subsets: ["latin", "devanagari"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Display face — used ONLY for the wordmark.
const bengali = Hind_Siliguri({
  variable: "--font-bengali",
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

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
      <body className={`${hind.variable} ${bengali.variable} ${yatra.variable} antialiased`}>
        <I18nProvider>
          <AuthProvider>{children}</AuthProvider>
        </I18nProvider>
        <SwRegister />
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Jost, Plus_Jakarta_Sans } from "next/font/google";
import { OfflineBar } from "@/components/offline";
import { PayPalDownBar } from "@/components/paypal-down";
import "./globals.css";

const jost = Jost({ subsets: ["latin"], variable: "--font-jost", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
  title: "Shugaba",
  description: "The savings circle your grandmother trusted, with a guarantee that you get paid.",
};

export const viewport: Viewport = { themeColor: "#FFFFFF", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jost.variable} ${jakarta.variable}`}>
      <body className="min-h-dvh">
        <OfflineBar />
        <PayPalDownBar />
        {children}
      </body>
    </html>
  );
}

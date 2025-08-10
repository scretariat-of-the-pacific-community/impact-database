import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";
import { AuthProvider } from "@/providers/auth-provider";
import ServiceWorkerRegistration from "@/components/service-worker-registration";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ocean Portal - Impact Database",
  description: "Disaster and hazard image metadata management system for Pacific Island communities",
  manifest: "/manifest.json",
  icons: { icon: "/favicon.ico" },
  keywords: ["disaster", "hazard", "images", "metadata", "pacific", "ocean", "impact", "assessment"],
  authors: [{ name: "SPC Ocean Portal Team" }],
  creator: "SPC (Pacific Community)",
  publisher: "SPC Ocean Portal",
};

export const viewport: Viewport = {
  themeColor: "#0ea5e9",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ServiceWorkerRegistration />
        <AuthProvider>
          <QueryProvider>{children}</QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

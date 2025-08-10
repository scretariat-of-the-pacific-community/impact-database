import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";
import ServiceWorkerRegistration from "@/components/service-worker-registration";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Impact Database",
  description: "Disaster and hazard image metadata management system",
  manifest: "/manifest.json",
  themeColor: "#ffffff",
  icons: { icon: "/favicon.ico" },
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
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";
import { AuthProvider } from "@/providers/auth-provider";
import ServiceWorkerRegistration from "@/components/service-worker-registration";
import ErrorBoundary from "@/components/ErrorBoundary";
import NetworkStatusBanner from "@/components/NetworkStatusBanner";
import { AnalyticsProvider } from "@/providers/analytics-provider";
import { Toaster } from "sonner";
import KeyboardShortcutsHelp from "@/components/KeyboardShortcutsHelp";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import GlobalShortcutsProvider from "@/components/GlobalShortcutsProvider";

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
      <body className="font-sans">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <ServiceWorkerRegistration />
        <GlobalShortcutsProvider />
        <AuthProvider>
          <QueryProvider>
            <AnalyticsProvider>
              <ErrorBoundary boundaryName="application">
                <NetworkStatusBanner />
                <Toaster position="top-right" richColors closeButton />
                <KeyboardShortcutsHelp />
                <PWAInstallPrompt />
                <main id="main-content" role="main" tabIndex={-1}>
                  {children}
                </main>
              </ErrorBoundary>
            </AnalyticsProvider>
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

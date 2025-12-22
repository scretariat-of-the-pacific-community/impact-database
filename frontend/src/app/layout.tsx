import type { Metadata, Viewport } from "next";
import "./globals.css";
import "../styles/tutorial.css";
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
import TutorialProvider from "@/components/TutorialProvider";
import TutorialButton from "@/components/TutorialButton";
import { Suspense } from "react";
import SessionExpirationBanner from "@/components/SessionExpirationBanner";

export const metadata: Metadata = {
  title: "Pacific Impact Atlas - Disaster Evidence Documentation",
  description: "Centralized repository of verified disaster impact imagery across Pacific island nations. ISO 19115 compliant disaster documentation, STAC-compatible geospatial catalog, and evidence-based climate resilience for cyclones, tsunamis, floods, and volcanic activity.",
  manifest: "/manifest.json",
  icons: { icon: "/favicon.ico" },
  keywords: [
    "disaster documentation",
    "pacific islands",
    "climate resilience",
    "hazard mapping",
    "cyclone impact",
    "tsunami evidence",
    "volcanic activity",
    "flood assessment",
    "satellite imagery",
    "ISO 19115",
    "STAC catalog",
    "geospatial data",
    "emergency response",
    "disaster risk reduction",
    "Pacific Community",
    "SPC",
  ],
  authors: [{ name: "Pacific Impact Atlas Team" }],
  creator: "SPC (Pacific Community)",
  publisher: "Pacific Impact Atlas",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://impact.pacificdata.org",
    title: "Pacific Impact Atlas - Disaster Evidence Repository",
    description: "Verified disaster impact imagery and evidence-based climate resilience for Pacific island nations",
    siteName: "Pacific Impact Atlas",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pacific Impact Atlas - Disaster Evidence Repository",
    description: "Verified disaster impact imagery for Pacific climate resilience",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#0ea5e9",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="font-sans bg-deep-950 text-surface-soft">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <ServiceWorkerRegistration />
        <GlobalShortcutsProvider />
        <AuthProvider>
          <QueryProvider>
            <Suspense fallback={null}>
              <AnalyticsProvider>
                <TutorialProvider autoStart={true}>
                  <ErrorBoundary boundaryName="application">
                    <NetworkStatusBanner />
                    <SessionExpirationBanner />
                    <Toaster position="top-right" richColors closeButton />
                    <KeyboardShortcutsHelp />
                    <PWAInstallPrompt />
                    <TutorialButton variant="fab" showMenu={true} />
                    <main id="main-content" role="main" tabIndex={-1}>
                      {children}
                    </main>
                  </ErrorBoundary>
                </TutorialProvider>
              </AnalyticsProvider>
            </Suspense>
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

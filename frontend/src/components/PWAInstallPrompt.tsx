/**
 * PWA Install Prompt Component
 * Prompts users to install the app as a PWA after 2nd visit
 */

'use client';

import { useEffect, useState } from 'react';
import { X, Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Avoid noisy console warnings during local development.
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    // Check if user has already dismissed or installed
    const dismissed = localStorage.getItem('pwa-prompt-dismissed');
    const installed = localStorage.getItem('pwa-installed');

    if (dismissed || installed) {
      return;
    }

    // Track visit count
    const visitCount = parseInt(localStorage.getItem('visit-count') || '0', 10);
    localStorage.setItem('visit-count', (visitCount + 1).toString());

    // Show prompt after 2nd visit
    if (visitCount < 1) {
      return;
    }

    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Show custom prompt after a delay
      setTimeout(() => {
        setShowPrompt(true);
      }, 3000); // Wait 3 seconds after page load
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Check if already installed
    const handleAppInstalled = () => {
      localStorage.setItem('pwa-installed', 'true');
      setShowPrompt(false);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    await deferredPrompt.prompt();

    // Wait for the user's response
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      localStorage.setItem('pwa-installed', 'true');
    }

    // Clear the deferred prompt
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    localStorage.setItem('pwa-prompt-dismissed', 'true');
    setShowPrompt(false);
  };

  if (!showPrompt || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-full max-w-sm animate-slide-up">
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-xl">
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute right-2 top-2 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Content */}
        <div className="mb-4 pr-6">
          <div className="mb-2 flex items-center gap-2">
            <Download className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Install App</h3>
          </div>
          <p className="text-sm text-gray-600">
            Install Pacific Impact Atlas for quick access and offline support.
            Perfect for field work.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleInstall}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Install
          </button>
          <button
            onClick={handleDismiss}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Not now
          </button>
        </div>

        {/* Benefits */}
        <div className="mt-3 space-y-1 border-t border-gray-100 pt-3">
          <p className="flex items-center gap-2 text-xs text-gray-500">
            <span className="text-green-600">✓</span> Works offline
          </p>
          <p className="flex items-center gap-2 text-xs text-gray-500">
            <span className="text-green-600">✓</span> Faster loading
          </p>
          <p className="flex items-center gap-2 text-xs text-gray-500">
            <span className="text-green-600">✓</span> Home screen access
          </p>
        </div>
      </div>
    </div>
  );
}

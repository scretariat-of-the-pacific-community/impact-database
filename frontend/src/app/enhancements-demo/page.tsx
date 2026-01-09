/**
 * Enhancement Demo Page
 * Showcases all UX enhancements: toast notifications, keyboard shortcuts, etc.
 */

'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Check,
  X,
  Info,
  AlertTriangle,
  Loader2,
  Keyboard,
  Download,
  Upload,
  RefreshCw,
} from 'lucide-react';

export default function EnhancementsDemoPage() {
  const [isLoading, setIsLoading] = useState(false);

  const showSuccessToast = () => {
    toast.success('Operation completed', {
      description: 'Your data has been saved successfully',
      duration: 3000,
    });
  };

  const showErrorToast = () => {
    toast.error('Failed to save', {
      description: 'There was an error saving your data',
      action: {
        label: 'Retry',
        onClick: () => toast.info('Retrying...'),
      },
    });
  };

  const showInfoToast = () => {
    toast.info('Did you know?', {
      description: 'You can press ? to see all keyboard shortcuts',
    });
  };

  const showWarningToast = () => {
    toast.warning('Network connection unstable', {
      description: 'Your uploads are being queued for later',
    });
  };

  const showLoadingToast = () => {
    setIsLoading(true);
    const loadingToastId = toast.loading('Processing your request...');

    setTimeout(() => {
      toast.dismiss(loadingToastId);
      toast.success('Processing complete!');
      setIsLoading(false);
    }, 3000);
  };

  const showPromiseToast = () => {
    toast.promise(new Promise((resolve) => setTimeout(resolve, 3000)), {
      loading: 'Uploading image...',
      success: 'Image uploaded successfully!',
      error: 'Failed to upload image',
    });
  };

  const showCustomToast = () => {
    toast('Custom Toast', {
      description: 'This toast has a custom icon and action',
      icon: <Upload className="h-5 w-5" />,
      action: {
        label: 'View',
        onClick: () => toast.info('Navigating to uploads...'),
      },
    });
  };

  const triggerKeyboardHelp = () => {
    window.dispatchEvent(new CustomEvent('show-keyboard-shortcuts'));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-12 px-4">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-bold text-gray-900">
            UX Enhancements Demo
          </h1>
          <p className="text-lg text-gray-600">
            Explore the new toast notifications, keyboard shortcuts, and PWA
            features
          </p>
        </div>

        {/* Toast Notifications Section */}
        <section className="mb-12 rounded-2xl bg-white p-8 shadow-lg">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-3">
              <Info className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Toast Notifications
              </h2>
              <p className="text-gray-600">Non-intrusive feedback system</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <button
              onClick={showSuccessToast}
              className="flex items-center justify-center gap-2 rounded-lg border-2 border-green-200 bg-green-50 px-4 py-3 font-semibold text-green-700 transition-all hover:border-green-300 hover:shadow-md"
            >
              <Check className="h-5 w-5" />
              Success Toast
            </button>

            <button
              onClick={showErrorToast}
              className="flex items-center justify-center gap-2 rounded-lg border-2 border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-700 transition-all hover:border-red-300 hover:shadow-md"
            >
              <X className="h-5 w-5" />
              Error Toast
            </button>

            <button
              onClick={showInfoToast}
              className="flex items-center justify-center gap-2 rounded-lg border-2 border-blue-200 bg-blue-50 px-4 py-3 font-semibold text-blue-700 transition-all hover:border-blue-300 hover:shadow-md"
            >
              <Info className="h-5 w-5" />
              Info Toast
            </button>

            <button
              onClick={showWarningToast}
              className="flex items-center justify-center gap-2 rounded-lg border-2 border-yellow-200 bg-yellow-50 px-4 py-3 font-semibold text-yellow-700 transition-all hover:border-yellow-300 hover:shadow-md"
            >
              <AlertTriangle className="h-5 w-5" />
              Warning Toast
            </button>

            <button
              onClick={showLoadingToast}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 rounded-lg border-2 border-purple-200 bg-purple-50 px-4 py-3 font-semibold text-purple-700 transition-all hover:border-purple-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Loader2
                className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`}
              />
              Loading Toast
            </button>

            <button
              onClick={showPromiseToast}
              className="flex items-center justify-center gap-2 rounded-lg border-2 border-indigo-200 bg-indigo-50 px-4 py-3 font-semibold text-indigo-700 transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <RefreshCw className="h-5 w-5" />
              Promise Toast
            </button>

            <button
              onClick={showCustomToast}
              className="col-span-full flex items-center justify-center gap-2 rounded-lg border-2 border-gray-200 bg-gray-50 px-4 py-3 font-semibold text-gray-700 transition-all hover:border-gray-300 hover:shadow-md"
            >
              <Upload className="h-5 w-5" />
              Custom Toast with Action
            </button>
          </div>

          <div className="mt-6 rounded-lg bg-blue-50 p-4">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> Toast notifications appear in the top-right
              corner and automatically dismiss after a few seconds. They support
              actions, icons, and different variants.
            </p>
          </div>
        </section>

        {/* Keyboard Shortcuts Section */}
        <section className="mb-12 rounded-2xl bg-white p-8 shadow-lg">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-3">
              <Keyboard className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Keyboard Shortcuts
              </h2>
              <p className="text-gray-600">Power user navigation</p>
            </div>
          </div>

          <div className="space-y-4">
            <button
              onClick={triggerKeyboardHelp}
              className="w-full rounded-lg border-2 border-purple-200 bg-purple-50 px-6 py-4 font-semibold text-purple-700 transition-all hover:border-purple-300 hover:shadow-md"
            >
              <Keyboard className="mx-auto mb-2 h-8 w-8" />
              Show All Keyboard Shortcuts
            </button>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-gray-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold text-gray-700">
                    Focus Search
                  </span>
                  <kbd className="rounded border border-gray-300 bg-white px-2 py-1 text-sm font-semibold">
                    /
                  </kbd>
                </div>
                <p className="text-sm text-gray-600">
                  Jump to search input from anywhere
                </p>
              </div>

              <div className="rounded-lg bg-gray-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold text-gray-700">
                    New Upload
                  </span>
                  <kbd className="rounded border border-gray-300 bg-white px-2 py-1 text-sm font-semibold">
                    N
                  </kbd>
                </div>
                <p className="text-sm text-gray-600">Navigate to upload page</p>
              </div>

              <div className="rounded-lg bg-gray-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold text-gray-700">Go Home</span>
                  <kbd className="rounded border border-gray-300 bg-white px-2 py-1 text-sm font-semibold">
                    H
                  </kbd>
                </div>
                <p className="text-sm text-gray-600">Return to homepage</p>
              </div>

              <div className="rounded-lg bg-gray-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold text-gray-700">
                    Close Modal
                  </span>
                  <kbd className="rounded border border-gray-300 bg-white px-2 py-1 text-sm font-semibold">
                    Esc
                  </kbd>
                </div>
                <p className="text-sm text-gray-600">
                  Close any open modal or dialog
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-purple-50 p-4">
              <p className="text-sm text-purple-800">
                <strong>Pro tip:</strong> Press{' '}
                <kbd className="mx-1 rounded border border-purple-300 bg-white px-2 py-0.5 text-xs font-semibold">
                  ?
                </kbd>{' '}
                anytime to see the full list of keyboard shortcuts.
              </p>
            </div>
          </div>
        </section>

        {/* PWA Features Section */}
        <section className="rounded-2xl bg-white p-8 shadow-lg">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-3">
              <Download className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">PWA Features</h2>
              <p className="text-gray-600">Install and use offline</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border-2 border-green-200 bg-green-50 p-6">
              <h3 className="mb-3 text-lg font-bold text-green-800">
                Installable App
              </h3>
              <p className="mb-4 text-green-700">
                After your second visit, you&apos;ll see a prompt to install
                Pacific Impact Atlas as an app. This gives you a native app
                experience with offline support.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-green-700">
                  <Check className="h-5 w-5" />
                  Works offline with cached data
                </li>
                <li className="flex items-center gap-2 text-green-700">
                  <Check className="h-5 w-5" />
                  Faster loading times
                </li>
                <li className="flex items-center gap-2 text-green-700">
                  <Check className="h-5 w-5" />
                  Home screen icon
                </li>
                <li className="flex items-center gap-2 text-green-700">
                  <Check className="h-5 w-5" />
                  Upload queue syncs automatically
                </li>
              </ul>
            </div>

            <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-6">
              <h3 className="mb-3 text-lg font-bold text-blue-800">
                Offline Upload Queue
              </h3>
              <p className="mb-4 text-blue-700">
                When you&apos;re offline, uploads are automatically queued and
                will sync when you&apos;re back online. Perfect for field work
                in remote areas.
              </p>
              <div className="rounded-lg bg-white p-4">
                <p className="text-sm text-gray-700">
                  <strong>How it works:</strong>
                </p>
                <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-gray-600">
                  <li>Submit upload while offline</li>
                  <li>File is stored locally in your browser</li>
                  <li>Toast notification confirms it&apos;s queued</li>
                  <li>When online, uploads sync automatically</li>
                  <li>Success/failure notifications appear</li>
                </ol>
              </div>
            </div>
          </div>
        </section>

        {/* Try It Out Section */}
        <section className="mt-12 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 p-8 text-white shadow-lg">
          <h2 className="mb-4 text-2xl font-bold">Try It Out!</h2>
          <div className="space-y-2 text-blue-100">
            <p>
              • Press{' '}
              <kbd className="mx-1 rounded bg-white/20 px-2 py-1 font-semibold text-white">
                ?
              </kbd>{' '}
              to see keyboard shortcuts
            </p>
            <p>
              • Press{' '}
              <kbd className="mx-1 rounded bg-white/20 px-2 py-1 font-semibold text-white">
                /
              </kbd>{' '}
              to focus the search bar
            </p>
            <p>
              • Click any toast button above to see different notification
              styles
            </p>
            <p>• Visit this site again to see the PWA install prompt</p>
            <p>• Try going offline and uploading an image to test the queue</p>
          </div>
        </section>
      </div>
    </div>
  );
}

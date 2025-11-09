'use client';

import clsx from 'clsx';
import { AlertTriangle, WifiOff } from 'lucide-react';
import React from 'react';

type BannerTone = 'error' | 'warning' | 'info' | 'success';

const toneStyles: Record<BannerTone, string> = {
  error: 'bg-red-50 border-red-200 text-red-900',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-900',
  info: 'bg-blue-50 border-blue-200 text-blue-900',
  success: 'bg-green-50 border-green-200 text-green-900',
};

interface ErrorBannerProps {
  title: string;
  message?: string;
  tone?: BannerTone;
  onRetry?: () => void;
  retryLabel?: string;
  icon?: React.ReactNode;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  title,
  message,
  tone = 'error',
  onRetry,
  retryLabel = 'Try again',
  icon,
}) => {
  return (
    <div
      className={clsx('rounded-md border p-4 flex items-start gap-3', toneStyles[tone])}
      role="alert"
      aria-live="assertive"
    >
      <div className="mt-0.5">
        {icon ??
          (tone === 'warning' ? (
            <AlertTriangle className="w-5 h-5" aria-hidden="true" />
          ) : tone === 'info' ? (
            <WifiOff className="w-5 h-5" aria-hidden="true" />
          ) : (
            <AlertTriangle className="w-5 h-5" aria-hidden="true" />
          ))}
      </div>
      <div className="flex-1">
        <p className="font-semibold">{title}</p>
        {message && <p className="text-sm mt-1">{message}</p>}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="ml-4 rounded-md border border-current px-3 py-1 text-sm font-medium hover:bg-white/30 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-current"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
};

export default ErrorBanner;

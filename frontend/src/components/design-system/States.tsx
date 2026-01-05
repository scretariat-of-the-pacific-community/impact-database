'use client';

import { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'spinner' | 'skeleton' | 'pulse';
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

export function LoadingState({
  message = 'Loading...',
  size = 'md',
  variant = 'spinner',
}: LoadingStateProps) {
  if (variant === 'spinner') {
    return (
      <div
        className="flex flex-col items-center justify-center py-12"
        role="status"
        aria-live="polite"
      >
        <Loader2
          className={`${sizeClasses[size]} animate-spin text-pacific-500`}
          aria-hidden="true"
        />
        <span className="mt-4 text-sm text-white/60">{message}</span>
        <span className="sr-only">{message}</span>
      </div>
    );
  }

  if (variant === 'pulse') {
    return (
      <div
        className="flex items-center justify-center py-12"
        role="status"
        aria-live="polite"
      >
        <div className="flex space-x-2">
          <div className="w-3 h-3 bg-pacific-500 rounded-full animate-pulse" />
          <div className="w-3 h-3 bg-pacific-500 rounded-full animate-pulse delay-75" />
          <div className="w-3 h-3 bg-pacific-500 rounded-full animate-pulse delay-150" />
        </div>
        <span className="sr-only">{message}</span>
      </div>
    );
  }

  return null;
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  variant?: 'minimal' | 'detailed';
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  variant = 'detailed',
}: ErrorStateProps) {
  if (variant === 'minimal') {
    return (
      <div className="text-center py-8" role="alert" aria-live="assertive">
        <p className="text-sm text-coral-400">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 text-sm text-pacific-400 hover:text-pacific-300 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pacific-500 focus-visible:ring-offset-2 focus-visible:ring-offset-deep-900 rounded transition-colors duration-200"
          >
            {retryLabel}
          </button>
        )}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center py-12 px-4"
      role="alert"
      aria-live="assertive"
    >
      <div className="w-16 h-16 rounded-full bg-coral-500/10 flex items-center justify-center mb-4">
        <svg
          className="w-8 h-8 text-coral-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-white mb-2">{title}</h3>
      <p className="text-sm text-white/60 text-center max-w-md mb-4">
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-pacific-500 hover:bg-pacific-600 text-white rounded-lg font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pacific-400 focus-visible:ring-offset-2 focus-visible:ring-offset-deep-900"
        >
          {retryLabel}
        </button>
      )}
    </motion.div>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center py-12 px-4"
    >
      {icon && (
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-white mb-2">{title}</h3>
      {message && (
        <p className="text-sm text-white/60 text-center max-w-md mb-4">
          {message}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-pacific-500 hover:bg-pacific-600 text-white rounded-lg font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pacific-400 focus-visible:ring-offset-2 focus-visible:ring-offset-deep-900"
        >
          {action.label}
        </button>
      )}
    </motion.div>
  );
}

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  animation?: 'pulse' | 'wave';
}

export function Skeleton({
  className = '',
  variant = 'rectangular',
  animation = 'pulse',
}: SkeletonProps) {
  const baseClasses = 'bg-white/10';
  const variantClasses = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };
  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer bg-gradient-to-r from-white/5 via-white/10 to-white/5 bg-[length:200%_100%]',
  };

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${animationClasses[animation]} ${className}`}
      aria-hidden="true"
    />
  );
}

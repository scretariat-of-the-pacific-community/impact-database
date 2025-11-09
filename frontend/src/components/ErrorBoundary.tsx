'use client';

import React, { Component, ReactNode } from 'react';
import ErrorBanner from './ErrorBanner';

type FallbackRender = (args: { error: Error; resetErrorBoundary: () => void }) => ReactNode;

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | FallbackRender;
  boundaryName?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(`[ErrorBoundary:${this.props.boundaryName ?? 'root'}]`, error, info);
  }

  private reset = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onReset?.();
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback, boundaryName } = this.props;

    if (hasError && error) {
      if (typeof fallback === 'function') {
        return fallback({ error, resetErrorBoundary: this.reset });
      }

      if (fallback) {
        return fallback;
      }

      return (
        <div className="max-w-3xl mx-auto mt-12">
          <ErrorBanner
            title="Something went wrong"
            message={
              boundaryName
                ? `We couldn't load the ${boundaryName}. Please try again.`
                : 'An unexpected error occurred.'
            }
            onRetry={this.reset}
          />
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;

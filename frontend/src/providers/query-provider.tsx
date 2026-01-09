'use client';

import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
  MutationCache,
} from '@tanstack/react-query';
import { ReactNode, useState, useEffect } from 'react';
import { isAxiosError } from 'axios';
import { trackQueryError } from '@/lib/analytics';

interface QueryProviderProps {
  children: ReactNode;
}

type NormalizedError = {
  message: string;
  details: Record<string, unknown>;
};

const trimStack = (stack?: string | null) =>
  stack?.split('\n').slice(0, 3).join('\n');

const normalizeError = (error: unknown): NormalizedError => {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    return {
      message: `${error.message}${status ? ` (${status})` : ''}`,
      details: {
        name: error.name,
        stack: trimStack(error.stack),
        status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url,
      },
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      details: {
        name: error.name,
        message: error.message,
        stack: trimStack(error.stack),
      },
    };
  }

  if (typeof error === 'string') {
    return {
      message: error,
      details: { raw: error },
    };
  }

  if (typeof error === 'object' && error !== null) {
    const message =
      typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : Object.prototype.toString.call(error);

    let details: Record<string, unknown>;
    try {
      details = JSON.parse(JSON.stringify(error));
    } catch {
      details = { raw: message };
    }

    return { message, details };
  }

  return {
    message: typeof error === 'undefined' ? 'Undefined error' : String(error),
    details: { raw: error as unknown },
  };
};

// Throttle connection errors to avoid console spam
const connectionErrorTracker = {
  lastError: 0,
  count: 0,
  THROTTLE_MS: 5000, // Only log connection errors every 5 seconds
};

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) => {
            // Suppress logging for queries with error suppression meta
            if (query?.meta?.errorMessage) {
              return;
            }

            const normalized = normalizeError(error);

            // Suppress 404 errors for settings endpoints that don't exist yet
            if (
              normalized.message === 'Not Found' &&
              query?.queryKey &&
              (query.queryKey.includes('user-settings') ||
                query.queryKey.includes('storage-quota') ||
                query.queryKey.includes('api-tokens'))
            ) {
              return;
            }

            // Throttle connection/network errors to avoid console spam
            const isConnectionError =
              normalized.message.includes('Unable to connect') ||
              normalized.message.includes('Network Error') ||
              normalized.message.includes('Failed to fetch') ||
              normalized.message.includes('ECONNREFUSED') ||
              normalized.message.includes('aborted') ||
              normalized.message.includes('cancelled') ||
              (normalized.details.status === undefined && isAxiosError(error));

            if (isConnectionError) {
              const now = Date.now();
              const timeSinceLastError = now - connectionErrorTracker.lastError;

              if (timeSinceLastError < connectionErrorTracker.THROTTLE_MS) {
                connectionErrorTracker.count++;
                return; // Suppress logging
              }

              // Log with count if there were suppressed errors
              if (connectionErrorTracker.count > 0) {
                console.warn(
                  `Connection error (${connectionErrorTracker.count + 1} occurrences suppressed):`,
                  normalized.message
                );
                connectionErrorTracker.count = 0;
              } else {
                console.warn('Connection error:', normalized.message);
              }

              connectionErrorTracker.lastError = now;
              trackQueryError(query?.queryHash, normalized.message);
              return;
            }

            console.error('Query error:', normalized.message, {
              details: normalized.details,
              query: {
                queryHash: query?.queryHash,
                queryKey: query?.queryKey,
              },
            });

            trackQueryError(query?.queryHash, normalized.message);
          },
        }),
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            const normalized = normalizeError(error);

            console.error('Mutation error:', normalized.message, {
              details: normalized.details,
              mutationKey: mutation?.options?.mutationKey,
            });

            trackQueryError(
              Array.isArray(mutation?.options?.mutationKey)
                ? mutation?.options?.mutationKey.join(':')
                : undefined,
              normalized.message
            );
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
            // Don't retry on authentication errors
            retry: (failureCount, error) => {
              if (isAxiosError(error) && error.response?.status === 401) {
                return false;
              }
              return failureCount < 3;
            },
          },
        },
      })
  );

  // Cancel all user-related queries when unauthorized
  useEffect(() => {
    const handleUnauthorized = () => {
      // Cancel all queries that require authentication
      queryClient.cancelQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return (
            typeof key === 'string' &&
            (key.includes('user') ||
              key.includes('profile') ||
              key.includes('contributor') ||
              key.includes('activity'))
          );
        },
      });
      // Invalidate to clear stale authenticated data
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return (
            typeof key === 'string' &&
            (key.includes('user') ||
              key.includes('profile') ||
              key.includes('contributor') ||
              key.includes('activity'))
          );
        },
      });
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

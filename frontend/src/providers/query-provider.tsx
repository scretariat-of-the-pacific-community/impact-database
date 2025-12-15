'use client';

import { QueryCache, QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
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
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

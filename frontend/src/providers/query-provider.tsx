'use client';

import { QueryCache, QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { captureException } from '@sentry/nextjs';
import { trackQueryError } from '@/lib/analytics';

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) => {
            captureException(error, {
              contexts: {
                reactQuery: {
                  queryHash: query?.queryHash,
                  queryKey: query?.queryKey,
                },
              },
              tags: { source: 'react-query', type: 'query' },
            });
            trackQueryError(query?.queryHash, (error as Error)?.message ?? 'Unknown error');
          },
        }),
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            captureException(error, {
              contexts: {
                reactQuery: {
                  mutationKey: mutation?.options?.mutationKey,
                },
              },
              tags: { source: 'react-query', type: 'mutation' },
            });
            trackQueryError(
              Array.isArray(mutation?.options?.mutationKey)
                ? mutation?.options?.mutationKey.join(':')
                : undefined,
              (error as Error)?.message ?? 'Unknown mutation error'
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

// Lightweight module shims to satisfy TypeScript when node_modules
// are unavailable in this environment. Replace with real types once
// dependencies are installed.

declare module 'framer-motion' {
  export const motion: any;
  export const useScroll: any;
  export const useTransform: any;
  export const AnimatePresence: any;
}

declare module '@tanstack/react-query' {
  export type QueryKey = readonly unknown[];
  export type UseQueryResult<TData = unknown, TError = unknown> = {
    data?: TData;
    error?: TError;
    isLoading?: boolean;
    isFetching?: boolean;
    refetch: (...args: any[]) => Promise<any>;
  };
  export type UseMutationResult<TData = unknown> = {
    data?: TData;
    isPending?: boolean;
    isError?: boolean;
    mutate: (variables: any) => void;
  };
  export function useQuery<TData = unknown, TError = unknown>(
    options: any
  ): UseQueryResult<TData, TError>;
  export function useMutation<TData = unknown>(
    options: any
  ): UseMutationResult<TData>;
  export function useQueryClient(): QueryClient;
  export class QueryClient {
    constructor(config?: any);
    invalidateQueries: (opts: any) => Promise<void>;
    cancelQueries?: (...args: any[]) => Promise<void>;
    getQueryData?: (...args: any[]) => any;
    setQueryData?: (...args: any[]) => any;
  }
  export const QueryClientProvider: React.ComponentType<any>;
}

declare module '@/components/design-system' {
  export const Button: any;
  export const Card: any;
  export const FormField: any;
  export const Select: any;
  export const Tag: any;
}

declare module 'react-compare-slider' {
  export const ReactCompareSlider: any;
  export const ReactCompareSliderImage: any;
}

declare module 'next/link' {
  import * as React from 'react';
  const Link: React.ComponentType<any>;
  export default Link;
}

declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

declare module 'lucide-react' {
  export const LockOpen: any;
  export const Camera: any;
  export const MapPin: any;
  export const Calendar: any;
  export const ArrowRight: any;
  export const ExternalLink: any;
  // Add other icons as needed
}

// Provide a minimal JSX namespace so JSX elements type-check.
declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
  interface IntrinsicAttributes {
    key?: string | number;
  }
}

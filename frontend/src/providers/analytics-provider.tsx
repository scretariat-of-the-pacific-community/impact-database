'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { trackPageView } from '@/lib/analytics';

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams?.toString();

  useEffect(() => {
    if (!pathname) return;
    const pathWithQuery = query ? `${pathname}?${query}` : pathname;
    trackPageView(pathWithQuery);
  }, [pathname, query]);

  return <>{children}</>;
}

export default AnalyticsProvider;

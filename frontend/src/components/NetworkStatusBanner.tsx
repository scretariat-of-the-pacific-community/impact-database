'use client';

import { useEffect, useState } from 'react';
import ErrorBanner from './ErrorBanner';

const NetworkStatusBanner = () => {
  const [isOnline, setIsOnline] = useState<boolean>(typeof window === 'undefined' ? true : navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="px-4 py-2">
      <ErrorBanner
        tone="warning"
        title="You're offline"
        message="We can't reach the server right now. Check your connection and we'll auto-retry when you're back online."
        icon={null}
      />
    </div>
  );
};

export default NetworkStatusBanner;

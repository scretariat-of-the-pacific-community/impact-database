'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';

export default function SessionExpirationBanner() {
  const { sessionExpired, sessionExpiring, clearError } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (sessionExpiring && pathname !== '/auth/login' && pathname !== '/auth/callback') {
      toast.warning('Session expiring soon', {
        description: 'We will refresh your session shortly. If it expires, please sign in again.',
        duration: 6000,
      });
    }
  }, [sessionExpiring, pathname]);

  useEffect(() => {
    // Don't show session expired toast if already on login or callback pages
    if (sessionExpired && pathname !== '/auth/login' && pathname !== '/auth/callback') {
      toast.error('Session expired', {
        description: 'Please sign in again to continue.',
        duration: 6000,
        action: {
          label: 'Sign in',
          onClick: () => {
            clearError();
            window.location.href = '/auth/login';
          },
        },
        onDismiss: clearError,
      });
    }
  }, [sessionExpired, clearError, pathname]);

  return null;
}

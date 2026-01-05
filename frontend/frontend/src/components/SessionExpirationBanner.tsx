'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/auth-provider';

export default function SessionExpirationBanner() {
  const { sessionExpired, clearError } = useAuth();

  useEffect(() => {
    if (sessionExpired) {
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
  }, [sessionExpired, clearError]);

  return null;
}

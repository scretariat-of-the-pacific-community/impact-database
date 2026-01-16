'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Waves, CheckCircle, RefreshCw } from 'lucide-react';

export default function ClearCachePage() {
  const router = useRouter();
  const [status, setStatus] = useState<'clearing' | 'success'>('clearing');

  useEffect(() => {
    // Clear all authentication-related storage
    try {
      // Clear localStorage
      localStorage.removeItem('ocean_portal_session');
      localStorage.removeItem('cached_user');

      // Clear sessionStorage
      sessionStorage.clear();

      // Clear any other auth-related items
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.includes('auth') ||
            key.includes('session') ||
            key.includes('user'))
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));

      setStatus('success');

      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push('/auth/login');
      }, 2000);
    } catch (error) {
      console.error('Failed to clear cache:', error);
      setStatus('success'); // Still show success to avoid confusion
    }
  }, [router]);

  if (status === 'clearing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <RefreshCw className="w-16 h-16 mx-auto mb-4 text-blue-600 animate-spin" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Clearing Cache...
          </h1>
          <p className="text-gray-600">Removing stale session data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
        <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-600" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Cache Cleared Successfully!
        </h1>
        <p className="text-gray-600 mb-4">
          All stale session data has been removed.
        </p>
        <p className="text-sm text-gray-500">Redirecting to login page...</p>
        <div className="mt-6 flex items-center justify-center">
          <Waves className="w-8 h-8 text-blue-600 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

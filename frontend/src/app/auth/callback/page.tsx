'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { handleCallback } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function processCallback() {
      try {
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const errorParam = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        // Handle OAuth error responses
        if (errorParam) {
          throw new Error(errorDescription || errorParam);
        }

        // Validate required parameters
        if (!code) {
          throw new Error('Missing authorization code');
        }

        // Process the callback
        await handleCallback(code, state || undefined);
        
        setStatus('success');
        
        // Redirect after success
        setTimeout(() => {
          router.push('/');
        }, 2000);
        
      } catch (err) {
        console.error('Auth callback error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setStatus('error');
        
        // Redirect to login after error
        setTimeout(() => {
          router.push('/auth/login');
        }, 3000);
      }
    }

    processCallback();
  }, [searchParams, handleCallback, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="mb-6">
            {status === 'loading' && (
              <>
                <Loader2 className="w-12 h-12 text-blue-600 mx-auto mb-4 animate-spin" />
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Signing you in...
                </h2>
                <p className="text-gray-600">
                  Please wait while we complete your authentication.
                </p>
              </>
            )}
            
            {status === 'success' && (
              <>
                <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Welcome to Ocean Portal!
                </h2>
                <p className="text-gray-600">
                  Successfully signed in. Redirecting to the portal...
                </p>
              </>
            )}
            
            {status === 'error' && (
              <>
                <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Authentication Failed
                </h2>
                <p className="text-gray-600 mb-4">
                  {error || 'An error occurred during authentication.'}
                </p>
                <button
                  onClick={() => router.push('/auth/login')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Try Again
                </button>
              </>
            )}
          </div>
          
          <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
            <span>Powered by</span>
            <span className="font-medium text-blue-600">SPC SSO</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50" />}>
      <AuthCallbackContent />
    </Suspense>
  );
}

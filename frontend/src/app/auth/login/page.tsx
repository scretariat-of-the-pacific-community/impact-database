'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { 
  Waves, 
  Shield, 
  Users, 
  Globe,
  ArrowRight,
  CheckCircle
} from 'lucide-react';
import ErrorBanner from '@/components/ErrorBanner';
import { sanitizeReturnUrl } from '@/lib/security';

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, signIn, isLoading, error: authError, clearError } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const sanitizedReturnUrl = sanitizeReturnUrl(searchParams.get('returnUrl'));
  const returnUrl = sanitizedReturnUrl || '/';

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.push(returnUrl);
    }
  }, [isAuthenticated, isLoading, router, returnUrl]);

  const handleSignIn = async () => {
    try {
      clearError();
      setIsSigningIn(true);
      await signIn(returnUrl);
    } catch (error) {
      console.error('Sign in failed:', error);
      setIsSigningIn(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (isAuthenticated) {
    return null; // Will redirect via useEffect
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50">
      <div className="flex flex-col lg:flex-row min-h-screen">
        {/* Left Panel - Branding */}
        <div className="lg:w-1/2 bg-gradient-to-r from-pacific-600 to-pacific-700 text-white p-8 flex flex-col justify-center">
          <div className="max-w-md mx-auto">
            <div className="flex items-center mb-8">
              <Waves className="w-12 h-12 mr-4" />
              <div>
                <h1 className="text-3xl font-bold">Pacific Impact Atlas</h1>
                <p className="text-pacific-100">Community Evidence Hub</p>
              </div>
            </div>
            
            <h2 className="text-2xl font-semibold mb-6">
              Your Photos Help Our Islands
            </h2>
            
            <p className="text-lg text-pacific-100 mb-8">
              Share field observations of cyclones, floods, tsunamis, and other hazards affecting Pacific communities. 
              Your contributions help emergency responders, climate scientists, and community leaders make better decisions.
            </p>
            
            <div className="space-y-4">
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 mr-3 text-palm-300" />
                <span>Share photos from your phone or camera</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 mr-3 text-palm-300" />
                <span>See how disasters affect our region</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 mr-3 text-palm-300" />
                <span>Support your community's resilience</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 mr-3 text-palm-300" />
                <span>No technical skills needed</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Right Panel - Login */}
        <div className="lg:w-1/2 p-8 flex flex-col justify-center">
          <div className="max-w-md mx-auto w-full">
            <div className="bg-white rounded-xl shadow-lg p-8">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Join Our Community
                </h2>
                <p className="text-gray-600">
                  Sign in to share your disaster observations and help protect Pacific communities
                </p>
              </div>
              
              {authError && (
                <div className="mb-6">
                  <ErrorBanner
                    title="We couldn't sign you in"
                    message={authError}
                    onRetry={handleSignIn}
                    retryLabel="Retry sign-in"
                  />
                </div>
              )}

              {/* SSO Benefits */}
              <div className="mb-8 p-4 bg-pacific-50 rounded-lg border border-pacific-200">
                <div className="flex items-start">
                  <Shield className="w-5 h-5 text-pacific-600 mt-0.5 mr-3" />
                  <div>
                    <h3 className="text-sm font-medium text-pacific-900 mb-1">
                      Simple & Secure Sign-In
                    </h3>
                    <p className="text-xs text-pacific-700">
                      Use your SPC account (staff, partners, or community members). 
                      If you don't have one, contact us to get access.
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Sign In Button */}
              <button
                onClick={handleSignIn}
                disabled={isSigningIn}4 bg-pacific-600 text-white font-semibold text-lg rounded-lg hover:bg-pacific-700 focus:ring-4 focus:ring-pacific-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {isSigningIn ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                    Signing you in...
                  </>
                ) : (
                  <>
                    Sign In to Contribute5 h-5 mr-3" />
                    Sign In with SPC SSO
                    <ArrowRight className="w-5 h-5 ml-3" />
                  </>
                )}
              </button>
              
              {/* Guest Access Info */}
              <div className="mt-6 p-4 bg-palm-50 rounded-lg border border-palm-200">
                <div className="flex items-start">
                  <Users className="w-5 h-5 text-palm-600 mt-0.5 mr-3" />
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-1">
                      Just Looking Around?
                    </h3>
                    <p className="text-xs text-gray-600 mb-3">
                      You can browse disaster images from across the Pacific without signing in. 
                      But you'll need an account to upload your own photos.
                    </p>
                    <button
                      onClick={() => router.push('/')}
                      className="text-sm text-palm-600 hover:text-palm-700 font-semibold"
                    >
                      Browse as Guest →
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Help */}
              <div className="mt-6 text-center">
                <p className="text-sm text-gray-600">
                  <strong>Need an account?</strong> Contact us at{' '}
                  <a 
                    href="mailto:ocean-portal@spc.int" 
                    className="text-pacific-600 hover:text-pacific-700 font-medium"
                  >
                    ocean-portal@spc.int
                  </a>
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  We welcome community members, first responders, NGO staff, and government partners.
                </p>
              </div>
            </div>
            
            {/* Footer */}
            <div className="mt-8 text-center text-sm text-gray-500">
              <p>
                By signing in, you agree to the{' '}
                <a href="/terms" className="text-blue-600 hover:text-blue-700">Terms of Service</a>
                {' '}and{' '}
                <a href="/privacy" className="text-blue-600 hover:text-blue-700">Privacy Policy</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50" />}>
      <LoginPageContent />
    </Suspense>
  );
}

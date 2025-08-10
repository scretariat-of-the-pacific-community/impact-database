'use client';

import { useEffect, useState } from 'react';
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

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, signIn, isLoading } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const returnUrl = searchParams.get('returnUrl') || '/';

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.push(returnUrl);
    }
  }, [isAuthenticated, isLoading, router, returnUrl]);

  const handleSignIn = async () => {
    try {
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
        <div className="lg:w-1/2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white p-8 flex flex-col justify-center">
          <div className="max-w-md mx-auto">
            <div className="flex items-center mb-8">
              <Waves className="w-12 h-12 mr-4" />
              <div>
                <h1 className="text-3xl font-bold">SPC Ocean Portal</h1>
                <p className="text-blue-100">Impact Assessment Database</p>
              </div>
            </div>
            
            <h2 className="text-2xl font-semibold mb-6">
              Discover Pacific Island Impact Data
            </h2>
            
            <p className="text-lg text-blue-100 mb-8">
              Access comprehensive disaster and hazard impact imagery from across the Pacific Island region. 
              Our portal supports evidence-based decision making for climate resilience and adaptation planning.
            </p>
            
            <div className="space-y-4">
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 mr-3 text-green-300" />
                <span>ISO 19115 compliant metadata</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 mr-3 text-green-300" />
                <span>Advanced spatial and temporal search</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 mr-3 text-green-300" />
                <span>Interactive mapping and visualization</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 mr-3 text-green-300" />
                <span>Secure access with role-based permissions</span>
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
                  Welcome Back
                </h2>
                <p className="text-gray-600">
                  Sign in with your SPC account to access the Ocean Portal
                </p>
              </div>
              
              {/* SSO Benefits */}
              <div className="mb-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-start">
                  <Shield className="w-5 h-5 text-blue-600 mt-0.5 mr-3" />
                  <div>
                    <h3 className="text-sm font-medium text-blue-900 mb-1">
                      Secure Single Sign-On
                    </h3>
                    <p className="text-xs text-blue-700">
                      Use your existing SPC credentials. No additional passwords to remember.
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Sign In Button */}
              <button
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="w-full flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSigningIn ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                    Signing In...
                  </>
                ) : (
                  <>
                    <Globe className="w-5 h-5 mr-3" />
                    Sign In with SPC SSO
                    <ArrowRight className="w-5 h-5 ml-3" />
                  </>
                )}
              </button>
              
              {/* Guest Access Info */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-start">
                  <Users className="w-5 h-5 text-gray-500 mt-0.5 mr-3" />
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-1">
                      Guest Access Available
                    </h3>
                    <p className="text-xs text-gray-600 mb-3">
                      Browse public datasets without signing in, but authentication is required for full access and contributions.
                    </p>
                    <button
                      onClick={() => router.push('/')}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Continue as Guest →
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Help */}
              <div className="mt-6 text-center">
                <p className="text-xs text-gray-500">
                  Need help signing in?{' '}
                  <a 
                    href="mailto:ocean-portal@spc.int" 
                    className="text-blue-600 hover:text-blue-700"
                  >
                    Contact Support
                  </a>
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

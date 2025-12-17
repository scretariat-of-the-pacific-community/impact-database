'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { 
  Waves, 
  Shield, 
  Users, 
  ArrowRight,
  CheckCircle,
  Github,
  Mail,
  AlertCircle
} from 'lucide-react';
import ErrorBanner from '@/components/ErrorBanner';
import { sanitizeReturnUrl } from '@/lib/security';

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, signIn, isLoading, error: authError, clearError } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  const sanitizedReturnUrl = sanitizeReturnUrl(searchParams.get('returnUrl'));
  const returnUrl = sanitizedReturnUrl || '/';

  // Check which providers are configured
  const providersAvailable = {
    google: !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    facebook: !!process.env.NEXT_PUBLIC_FACEBOOK_APP_ID,
    github: !!process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
  };

  const hasAnyProvider = Object.values(providersAvailable).some(available => available);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.push(returnUrl);
    }
  }, [isAuthenticated, isLoading, router, returnUrl]);

  const handleSignIn = async (provider: 'google' | 'facebook' | 'github') => {
    try {
      clearError();
      setIsSigningIn(true);
      await signIn(returnUrl, provider);
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
    <div className="min-h-screen bg-gray-50">
      <div className="flex flex-col lg:flex-row min-h-screen">
        {/* Left Panel - Branding */}
        <div className="lg:w-1/2 bg-gradient-to-br from-blue-600 via-cyan-600 to-teal-600 text-white p-8 flex flex-col justify-center">
          <div className="max-w-md mx-auto">
            <div className="flex items-center mb-8">
              <Waves className="w-12 h-12 mr-4" />
              <div>
                <h1 className="text-3xl font-bold">Pacific Impact Atlas</h1>
                <p className="text-blue-100">Community Evidence Hub</p>
              </div>
            </div>
            
            <h2 className="text-2xl font-semibold mb-6">
              Your Photos Help Our Islands
            </h2>
            
            <p className="text-lg text-blue-50 mb-8">
              Share field observations of cyclones, floods, tsunamis, and other hazards affecting Pacific communities. 
              Your contributions help emergency responders, climate scientists, and community leaders make better decisions.
            </p>
            
            <div className="space-y-4">
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 mr-3 text-green-300" />
                <span>Share photos from your phone or camera</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 mr-3 text-green-300" />
                <span>See how disasters affect our region</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 mr-3 text-green-300" />
                <span>Support your community's resilience</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 mr-3 text-green-300" />
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
                    onRetry={() => handleSignIn('google')}
                    retryLabel="Retry sign-in"
                  />
                </div>
              )}

              {/* Social Media Benefits */}
              <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-start">
                  <Shield className="w-5 h-5 text-blue-600 mt-0.5 mr-3" />
                  <div>
                    <h3 className="text-sm font-medium text-blue-900 mb-1">
                      Quick & Secure Sign-In
                    </h3>
                    <p className="text-xs text-blue-700">
                      Use your existing Google, Facebook, or GitHub account. 
                      No need to create a new password.
                    </p>
                  </div>
                </div>
              </div>
              
              {!hasAnyProvider && (
                <div className="mb-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="flex items-start">
                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 mr-3" />
                    <div>
                      <h3 className="text-sm font-medium text-amber-900 mb-1">
                        OAuth Not Configured
                      </h3>
                      <p className="text-xs text-amber-700 mb-2">
                        Social media login is not configured. Please set up OAuth providers to enable authentication.
                      </p>
                      <a 
                        href="https://github.com/kishkumar96/impact-database/blob/main/docs/SOCIAL_AUTH_SETUP.md"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-amber-800 hover:text-amber-900 font-semibold underline"
                      >
                        View Setup Guide →
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Social Sign In Buttons */}
              <div className="space-y-3">
                {/* Google Sign In */}
                <button
                  onClick={() => handleSignIn('google')}
                  disabled={isSigningIn || !providersAvailable.google}
                  className="w-full flex items-center justify-center px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 hover:border-gray-400 focus:ring-4 focus:ring-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm relative"
                  title={!providersAvailable.google ? 'Google OAuth not configured. Add NEXT_PUBLIC_GOOGLE_CLIENT_ID to your .env file.' : ''}
                >
                  {isSigningIn ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-700"></div>
                  ) : (
                    <>
                      <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      Continue with Google
                      {!providersAvailable.google && (
                        <span className="ml-2 text-xs text-amber-600">(Not configured)</span>
                      )}
                    </>
                  )}
                </button>

                {/* Facebook Sign In */}
                <button
                  onClick={() => handleSignIn('facebook')}
                  disabled={isSigningIn || !providersAvailable.facebook}
                  className="w-full flex items-center justify-center px-6 py-3 bg-[#1877F2] text-white font-medium rounded-lg hover:bg-[#166FE5] focus:ring-4 focus:ring-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  title={!providersAvailable.facebook ? 'Facebook OAuth not configured. Add NEXT_PUBLIC_FACEBOOK_APP_ID to your .env file.' : ''}
                >
                  {isSigningIn ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  ) : (
                    <>
                      <svg className="w-5 h-5 mr-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                      Continue with Facebook
                      {!providersAvailable.facebook && (
                        <span className="ml-2 text-xs text-amber-200">(Not configured)</span>
                      )}
                    </>
                  )}
                </button>

                {/* GitHub Sign In */}
                <button
                  onClick={() => handleSignIn('github')}
                  disabled={isSigningIn || !providersAvailable.github}
                  className="w-full flex items-center justify-center px-6 py-3 bg-gray-800 text-white font-medium rounded-lg hover:bg-gray-900 focus:ring-4 focus:ring-gray-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  title={!providersAvailable.github ? 'GitHub OAuth not configured. Add NEXT_PUBLIC_GITHUB_CLIENT_ID to your .env file.' : ''}
                >
                  {isSigningIn ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  ) : (
                    <>
                      <Github className="w-5 h-5 mr-3" />
                      Continue with GitHub
                      {!providersAvailable.github && (
                        <span className="ml-2 text-xs text-gray-400">(Not configured)</span>
                      )}
                    </>
                  )}
                </button>
              </div>

              <div className="my-6 flex items-center">
                <div className="flex-1 border-t border-gray-300"></div>
                <button 
                  onClick={() => setShowEmailForm(!showEmailForm)}
                  className="px-4 text-sm text-gray-500 hover:text-gray-700 font-medium"
                >
                  {showEmailForm ? 'Use social login instead' : 'Or use email'}
                </button>
                <div className="flex-1 border-t border-gray-300"></div>
              </div>

              {showEmailForm ? (
                <div className="space-y-4">
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    setIsSigningIn(true);
                    
                    try {
                      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                      const endpoint = isRegistering ? '/api/v1/auth/register' : '/api/v1/auth/login';
                      const body = isRegistering 
                        ? { username: email.split('@')[0], email, password, full_name: email.split('@')[0] }
                        : { username: email, password };
                      
                      const response = await fetch(`${apiUrl}${endpoint}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                      });
                      
                      if (response.ok) {
                        const data = await response.json();
                        
                        // Store session in format expected by AuthProvider
                        const session = {
                          user: {
                            id: data.id,
                            username: data.username,
                            email: data.email,
                            full_name: data.full_name,
                            roles: ['contributor']
                          },
                          access_token: data.access_token,
                          refresh_token: data.refresh_token || undefined,
                          expires_at: Date.now() + (60 * 60 * 1000), // 1 hour from now
                        };
                        
                        localStorage.setItem('ocean_portal_session', JSON.stringify(session));
                        
                        // Set auth cookie
                        document.cookie = `ocean_portal_token=${encodeURIComponent(data.access_token)}; Max-Age=3600; path=/; Secure; SameSite=Strict`;
                        
                        // Force page reload to reinitialize AuthProvider
                        window.location.href = returnUrl;
                      } else {
                        const error = await response.json();
                        alert(error.detail || (isRegistering ? 'Registration failed' : 'Login failed. Please check your credentials.'));
                      }
                    } catch (error) {
                      console.error('Auth error:', error);
                      alert('Unable to connect to server. Please try again.');
                    } finally {
                      setIsSigningIn(false);
                    }
                  }} className="space-y-3">
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                        {isRegistering ? 'Email' : 'Username or Email'}
                      </label>
                      <input
                        id="email"
                        type={isRegistering ? 'email' : 'text'}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder={isRegistering ? 'your.email@example.com' : 'username or email'}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                        Password
                      </label>
                      <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        placeholder="••••••••"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSigningIn}
                      className="w-full flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSigningIn ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      ) : (
                        <>
                          <Mail className="w-5 h-5 mr-2" />
                          {isRegistering ? 'Create Account' : 'Sign In'}
                        </>
                      )}
                    </button>
                  </form>

                  <div className="text-center">
                    <button
                      onClick={() => setIsRegistering(!isRegistering)}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      {isRegistering ? 'Already have an account? Sign in' : "Don't have an account? Register"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3">
                  <p className="mb-2">
                    <strong>✓ Faster:</strong> No forms to fill, no passwords to remember
                  </p>
                  <p className="mb-2">
                    <strong>✓ Safer:</strong> We never see or store your password
                  </p>
                  <p>
                    <strong>✓ Easier:</strong> One account across devices and platforms
                  </p>
                </div>
              )}
              
              {/* Guest Access Info */}
              <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-start">
                  <Users className="w-5 h-5 text-green-600 mt-0.5 mr-3" />
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
                      className="text-sm text-green-600 hover:text-green-700 font-semibold"
                    >
                      Browse as Guest →
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Help */}
              <div className="mt-6 text-center">
                <p className="text-sm text-gray-600">
                  <strong>Need help?</strong> Email us at{' '}
                  <a 
                    href="mailto:support@pacific-impact-atlas.org" 
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    support@pacific-impact-atlas.org
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

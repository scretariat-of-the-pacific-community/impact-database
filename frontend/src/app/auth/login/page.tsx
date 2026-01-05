'use client';

import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { 
  Waves, 
  Users, 
  CheckCircle,
  Mail
} from 'lucide-react';
import { sanitizeReturnUrl } from '@/lib/security';
import { oceanPortalApi } from '@/lib/api';

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Calculate password strength
  const getPasswordStrength = (pwd: string): { score: number; label: string; color: string } => {
    if (pwd.length === 0) return { score: 0, label: '', color: '' };
    
    let score = 0;
    if (pwd.length >= 12) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) score++;
    
    if (score <= 2) return { score, label: 'Weak', color: 'text-red-600' };
    if (score === 3) return { score, label: 'Fair', color: 'text-orange-600' };
    if (score === 4) return { score, label: 'Good', color: 'text-yellow-600' };
    return { score, label: 'Strong', color: 'text-green-600' };
  };
  
  const passwordStrength = isRegistering ? getPasswordStrength(password) : null;

  const sanitizedReturnUrl = sanitizeReturnUrl(searchParams.get('returnUrl'));
  const returnUrl = sanitizedReturnUrl || '/';

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.push(returnUrl);
    }
  }, [isAuthenticated, isLoading, router, returnUrl]);

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
              
              <div className="space-y-4">
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    
                    // Validate password strength for registration
                    if (isRegistering) {
                      if (password.length < 12) {
                        toast.error('Password too short', {
                          description: 'Password must be at least 12 characters long',
                        });
                        return;
                      }
                      if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
                        toast.error('Password too weak', {
                          description: 'Password must contain both uppercase and lowercase letters',
                        });
                        return;
                      }
                      if (!/\d/.test(password)) {
                        toast.error('Password too weak', {
                          description: 'Password must contain at least one number',
                        });
                        return;
                      }
                      if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
                        toast.error('Password too weak', {
                          description: 'Password must contain at least one special character',
                        });
                        return;
                      }
                    }
                    
                    setIsSigningIn(true);
                    
                    try {
                      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                      const endpoint = isRegistering ? '/api/auth/register' : '/api/auth/login';
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
                        
                        const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);  // 7 days
                        
                        // Set auth cookie with Secure flag only on HTTPS
                        const isSecure = window.location.protocol === 'https:';
                        const secureFlag = isSecure ? '; Secure' : '';
                        document.cookie = `ocean_portal_token=${encodeURIComponent(data.access_token)}; Max-Age=${7 * 24 * 60 * 60}; path=/; SameSite=Strict${secureFlag}`;  // 7 days
                        
                        let currentUser = null;
                        try {
                          currentUser = await oceanPortalApi.getCurrentUser();
                        } catch (err) {
                          console.error('Failed to fetch user profile:', err);
                        }
                        
                        const cachedSession = {
                          user: currentUser || {
                            id: data.id,
                            username: data.username,
                            email: data.email,
                            full_name: data.full_name,
                            roles: ['contributor'],
                          },
                          expires_at: expiresAt,
                        };
                        
                        localStorage.setItem('ocean_portal_session', JSON.stringify(cachedSession));
                        
                        // Force page reload to reinitialize AuthProvider
                        window.location.href = returnUrl;
                      } else {
                        // Generic error message to prevent username enumeration
                        const statusCode = response.status;
                        if (statusCode === 401 || statusCode === 400) {
                          toast.error(isRegistering ? 'Registration failed' : 'Login failed', {
                            description: isRegistering 
                              ? 'Unable to create account. Please check your details and try again.'
                              : 'Invalid credentials. Please check your username and password.',
                          });
                        } else {
                          toast.error('Unable to connect to server', {
                            description: 'Please try again later.',
                          });
                        }
                      }
                    } catch (error) {
                      console.error('Auth error:', error);
                      toast.error('Unable to connect to server', {
                        description: 'Please try again.',
                      });
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                        Password {isRegistering && <span className="text-xs text-gray-500">(min 12 chars)</span>}
                      </label>
                      <div className="relative">
                        <input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={isRegistering ? 12 : undefined}
                          placeholder="••••••••"
                          className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          )}
                        </button>
                      </div>
                      {isRegistering && (
                        <>
                          <p className="mt-1 text-xs text-gray-600">
                            Must contain uppercase, lowercase, number, and special character
                          </p>
                          {password && passwordStrength && (
                            <div className="mt-2">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full transition-all duration-300 ${
                                      passwordStrength.score <= 2 ? 'bg-red-500' :
                                      passwordStrength.score === 3 ? 'bg-orange-500' :
                                      passwordStrength.score === 4 ? 'bg-yellow-500' : 'bg-green-500'
                                    }`}
                                    style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                                  />
                                </div>
                                <span className={`text-xs font-medium ${passwordStrength.color}`}>
                                  {passwordStrength.label}
                                </span>
                              </div>
                            </div>
                          )}
                        </>
                      )}
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

                <div className="text-center mt-4">
                  <button
                    onClick={() => setIsRegistering(!isRegistering)}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {isRegistering ? 'Already have an account? Sign in' : "Don't have an account? Register"}
                  </button>
                </div>
              </div>
              
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

'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, AuthSession } from '@/lib/types';
import { sanitizeReturnUrl } from '@/lib/security';

interface AuthContextType {
  user: User | null;
  session: AuthSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  signIn: (returnUrl?: string, provider?: 'google' | 'facebook' | 'github') => Promise<void>;
  signOut: () => Promise<void>;
  hasRole: (role: string) => boolean;
  handleCallback: (code: string, state?: string) => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// OAuth2 Configuration for Social Media Providers
type AuthProvider = 'google' | 'facebook' | 'github';

const authProviders = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
    scopes: ['openid', 'profile', 'email'],
  },
  facebook: {
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    userInfoUrl: 'https://graph.facebook.com/me?fields=id,name,email,picture',
    clientId: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || '',
    scopes: ['email', 'public_profile'],
  },
  github: {
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    clientId: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || '',
    scopes: ['read:user', 'user:email'],
  },
};

const getRedirectUri = () => 
  typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '';

// SPC SSO Configuration (OIDC/OAuth2)
const authConfig = {
  issuer: process.env.NEXT_PUBLIC_SPC_SSO_ISSUER || 'https://sso.spc.int',
  clientId: process.env.NEXT_PUBLIC_SPC_SSO_CLIENT_ID || 'ocean-portal',
  redirectUri: getRedirectUri(),
  responseType: 'code',
  scopes: ['openid', 'profile', 'email'],
  prompt: 'select_account',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const isAuthenticated = !!user && !!session;

  // Initialize auth state from storage
  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      setIsLoading(true);
      
      // Check for stored session
      const storedSession = getStoredSession();
      if (storedSession && !isSessionExpired(storedSession)) {
        setSession(storedSession);
        setUser(storedSession.user);
        
        // Refresh token if needed (only if we have a refresh token)
        if (storedSession.refresh_token && shouldRefreshToken(storedSession)) {
          await refreshAccessToken(storedSession.refresh_token);
        }
      } else {
        // Clear expired session
        clearStoredSession();
      }
    } catch (error) {
      console.error('Auth initialization failed:', error);
      setAuthError('Unable to verify your session. Please sign in again.');
      clearStoredSession();
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = async (returnUrl?: string, provider: AuthProvider = 'google') => {
    try {
      setAuthError(null);
      const providerConfig = authProviders[provider];
      
      if (!providerConfig.clientId) {
        const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
        const errorMessage = `${providerName} authentication is not configured. Please add NEXT_PUBLIC_${provider.toUpperCase()}_CLIENT_ID to your environment variables.`;
        setAuthError(errorMessage);
        console.error(errorMessage);
        console.info('See docs/SOCIAL_AUTH_SETUP.md for setup instructions');
        throw new Error(errorMessage);
      }
      
      // Generate PKCE challenge for security
      const { codeVerifier, codeChallenge } = await generatePKCE();
      
      // Store PKCE verifier, provider, and return URL
      sessionStorage.setItem('oauth_code_verifier', codeVerifier);
      sessionStorage.setItem('oauth_provider', provider);
      const safeReturnUrl = sanitizeReturnUrl(returnUrl);
      if (safeReturnUrl) {
        sessionStorage.setItem('oauth_return_url', safeReturnUrl);
      }

      // Build authorization URL for selected provider
      const params = new URLSearchParams({
        client_id: providerConfig.clientId,
        redirect_uri: getRedirectUri(),
        response_type: 'code',
        scope: providerConfig.scopes.join(' '),
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state: Math.random().toString(36).substring(7),
      });
      
      const authUrl = `${providerConfig.authUrl}?${params.toString()}`;
      
      // Redirect to social media provider
      window.location.href = authUrl;
    } catch (error) {
      console.error('Sign in failed:', error);
      if (!authError) { // Only set generic error if we haven't already set a specific one
        setAuthError('We could not start the sign-in flow. Please check your configuration and try again.');
      }
      throw error;
    }
  };

  const signOut = async () => {
    try {
      const currentSession = session;
      
      // Clear local state
      setUser(null);
      setSession(null);
      setAuthError(null);
      clearStoredSession();

      // Build logout URL for SPC SSO
      if (currentSession?.access_token) {
        const logoutUrl = buildLogoutUrl(currentSession.access_token);
        window.location.href = logoutUrl;
      } else {
        // Fallback: redirect to home
        window.location.href = '/';
      }
    } catch (error) {
      console.error('Sign out failed:', error);
      setAuthError('We were unable to sign you out completely. Please close the tab or try again.');
      // Still clear local state even if remote logout fails
      window.location.href = '/';
    }
  };

  const hasRole = (role: string): boolean => {
    return user?.roles?.includes(role as any) || false;
  };

  // Handle OAuth callback
  const handleCallback = async (code: string, state?: string) => {
    try {
      setIsLoading(true);
      
      const codeVerifier = sessionStorage.getItem('oauth_code_verifier');
      if (!codeVerifier) {
        throw new Error('Missing PKCE code verifier');
      }

      // Exchange code for tokens
      const tokenResponse = await exchangeCodeForTokens(code, codeVerifier);
      
      // Get user info
      const userInfo = await getUserInfo(tokenResponse.access_token);
      
      // Create session
      const newSession: AuthSession = {
        user: userInfo,
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        expires_at: Date.now() + (tokenResponse.expires_in * 1000),
      };

      // Store session
      setSession(newSession);
      setUser(userInfo);
      storeSession(newSession);

      // Clean up
      sessionStorage.removeItem('oauth_code_verifier');
      
      // Redirect to return URL or home
      const returnUrl = sanitizeReturnUrl(sessionStorage.getItem('oauth_return_url'));
      sessionStorage.removeItem('oauth_return_url');
      
      window.location.href = sanitizeReturnUrl(returnUrl);
    } catch (error) {
      console.error('OAuth callback failed:', error);
      setAuthError('We could not complete your sign-in. Please try again.');
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const value: AuthContextType = {
    user,
    session,
    isLoading,
    isAuthenticated,
    signIn,
    signOut,
    hasRole,
    handleCallback, // Export for callback page
    error: authError,
    clearError: () => setAuthError(null),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Helper functions
function getStoredSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem('ocean_portal_session');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function storeSession(session: AuthSession): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem('ocean_portal_session', JSON.stringify(session));
    setAuthCookie(session.access_token);
  } catch (error) {
    console.error('Failed to store session:', error);
  }
}

function clearStoredSession(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem('ocean_portal_session');
    setAuthCookie(null);
  } catch (error) {
    console.error('Failed to clear session:', error);
  }
}

function setAuthCookie(token: string | null) {
  if (typeof document === 'undefined') return;
  if (!token) {
    document.cookie = 'ocean_portal_token=; Max-Age=0; path=/; Secure; SameSite=Strict';
    return;
  }
  document.cookie = `ocean_portal_token=${encodeURIComponent(token)}; Max-Age=3600; path=/; Secure; SameSite=Strict`;
}

function isSessionExpired(session: AuthSession): boolean {
  return Date.now() >= session.expires_at;
}

function shouldRefreshToken(session: AuthSession): boolean {
  // Refresh if expiring within 5 minutes
  return Date.now() >= (session.expires_at - 5 * 60 * 1000);
}

async function generatePKCE(): Promise<{codeVerifier: string; codeChallenge: string}> {
  const codeVerifier = generateRandomString(128);
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const codeChallenge = base64URLEncode(digest);
  
  return { codeVerifier, codeChallenge };
}

function generateRandomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[Math.floor(Math.random() * charset.length)];
  }
  return result;
}

function base64URLEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function buildAuthorizationUrl(codeChallenge: string): string {
  const params = new URLSearchParams({
    response_type: authConfig.responseType,
    client_id: authConfig.clientId,
    redirect_uri: authConfig.redirectUri,
    scope: authConfig.scopes.join(' '),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: authConfig.prompt,
    state: generateRandomString(32), // CSRF protection
  });

  return `${authConfig.issuer}/auth?${params.toString()}`;
}

function buildLogoutUrl(accessToken: string): string {
  const params = new URLSearchParams({
    post_logout_redirect_uri: typeof window !== 'undefined' ? window.location.origin : '',
    id_token_hint: accessToken, // Some OIDC providers expect this
  });

  return `${authConfig.issuer}/logout?${params.toString()}`;
}

async function exchangeCodeForTokens(code: string, codeVerifier: string) {
  const response = await fetch(`${authConfig.issuer}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: authConfig.clientId,
      code,
      redirect_uri: authConfig.redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.statusText}`);
  }

  return response.json();
}

async function getUserInfo(accessToken: string): Promise<User> {
  const response = await fetch(`${authConfig.issuer}/userinfo`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`User info request failed: ${response.statusText}`);
  }

  const userInfo = await response.json();
  
  // Map OIDC user info to our User type
  return {
    id: userInfo.sub,
    email: userInfo.email,
    name: userInfo.name || userInfo.preferred_username,
    roles: userInfo.roles || ['viewer'], // Default to viewer role
    organization: userInfo.organization,
    country: userInfo.country,
    created_at: userInfo.created_at || new Date().toISOString(),
    last_login: new Date().toISOString(),
  };
}

async function refreshAccessToken(refreshToken?: string) {
  if (!refreshToken) {
    console.warn('Skipping token refresh because no refresh token is stored.');
    return null;
  }

  const response = await fetch(`${authConfig.issuer}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: authConfig.clientId,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.statusText}`);
  }

  return response.json();
}

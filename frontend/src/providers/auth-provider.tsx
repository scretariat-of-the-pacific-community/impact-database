'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, AuthSession } from '@/lib/types';
import { sanitizeReturnUrl, readCookie } from '@/lib/security';
import { oceanPortalApi } from '@/lib/api';

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

interface OAuthProviderConfig {
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  clientId: string;
  scopes: string[];
}

const authProviders: Record<AuthProvider, OAuthProviderConfig> = {
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

interface CachedSessionMetadata {
  user: User;
  expires_at: number;
}

const SESSION_STORAGE_KEY = 'ocean_portal_session';

export function AuthProvider({ children }: { children: ReactNode }) {
  // Session management functions (moved inside component to avoid hoisting issues with Turbopack)
  const getCachedSession = (): CachedSessionMetadata | null => {
    if (typeof window === 'undefined') return null;

    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored) as CachedSessionMetadata;
      return parsed?.user ? parsed : null;
    } catch {
      return null;
    }
  };

  const cacheSessionMetadata = (session: AuthSession): void => {
    if (typeof window === 'undefined') return;

    try {
      const safePayload: CachedSessionMetadata = {
        user: session.user,
        expires_at: session.expires_at,
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(safePayload));
      // Server sets HttpOnly cookie, no need to set it here
    } catch (error) {
      console.error('Failed to cache session metadata:', error);
    }
  };

  const setAuthCookie = (token: string | null): void => {
    // SECURITY: Cookie is now set server-side with HttpOnly flag
    // This function is kept for clearing cookies only
    if (typeof document === 'undefined') return;
    
    if (!token) {
      // Only clear cookie on logout
      document.cookie = `ocean_portal_token=; Max-Age=0; path=/; SameSite=Strict`;
    }
    // Server sets the cookie on login with HttpOnly + Secure flags
  };

  const clearCachedSession = (): void => {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      setAuthCookie(null);
    } catch (error) {
      console.error('Failed to clear session:', error);
    }
  };

  const isCachedSessionExpired = (session: CachedSessionMetadata): boolean => {
    return Date.now() >= session.expires_at;
  };
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const isAuthenticated = Boolean(user);

  const initializeAuth = async () => {
    try {
      setIsLoading(true);
      const cachedSession = getCachedSession();
      const cookieToken = readCookie('ocean_portal_token');

      if (!cookieToken) {
        clearCachedSession();
        setSession(null);
        setUser(null);
        return;
      }

      let resolvedUser = cachedSession?.user ?? null;
      let resolvedExpiry = cachedSession?.expires_at ?? 0;

      const cacheExpired = cachedSession ? isCachedSessionExpired(cachedSession) : true;

      if (!resolvedUser || cacheExpired) {
        try {
          resolvedUser = await oceanPortalApi.getCurrentUser();
          resolvedExpiry = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days to match token expiration
        } catch (error: any) {
          // Only clear session on actual auth errors, not network errors
          if (error?.response?.status === 401 || error?.response?.status === 403) {
            console.error('Session validation failed - authentication error:', error);
            clearCachedSession();
            setSession(null);
            setUser(null);
          } else {
            // Network error or other issue - keep cached session if available
            console.warn('Failed to validate session, keeping cached data:', error);
            if (cachedSession?.user) {
              resolvedUser = cachedSession.user;
              resolvedExpiry = cachedSession.expires_at;
            }
          }
          return;
        }
      }

      if (!resolvedUser) {
        clearCachedSession();
        setSession(null);
        setUser(null);
        return;
      }

      if (!resolvedExpiry) {
        resolvedExpiry = Date.now() + (7 * 24 * 60 * 60 * 1000);  // 7 days
      }

      const restoredSession: AuthSession = {
        user: resolvedUser,
        access_token: cookieToken,
        expires_at: resolvedExpiry,
      };

      setSession(restoredSession);
      setUser(resolvedUser);
      cacheSessionMetadata(restoredSession);
    } catch (error) {
      console.error('Auth initialization failed:', error);
      // Don't set error here to avoid redirect loops
      clearCachedSession();
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize auth state from storage
  useEffect(() => {
    initializeAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      
      // Generate cryptographically secure state parameter for CSRF protection
      const stateValue = generateSecureRandomString(32);
      
      // Store PKCE verifier, state, provider, and return URL
      sessionStorage.setItem('oauth_code_verifier', codeVerifier);
      sessionStorage.setItem('oauth_state', stateValue);
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
        state: stateValue,
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
      clearCachedSession();

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
      
      // CRITICAL: Validate state parameter to prevent CSRF attacks
      const storedState = sessionStorage.getItem('oauth_state');
      if (!storedState) {
        throw new Error('Missing OAuth state parameter - possible CSRF attack');
      }
      
      if (state !== storedState) {
        // Clear all OAuth session data on state mismatch
        sessionStorage.removeItem('oauth_state');
        sessionStorage.removeItem('oauth_code_verifier');
        sessionStorage.removeItem('oauth_provider');
        sessionStorage.removeItem('oauth_return_url');
        throw new Error('OAuth state mismatch - possible CSRF attack detected');
      }
      
      const codeVerifier = sessionStorage.getItem('oauth_code_verifier');
      if (!codeVerifier) {
        throw new Error('Missing PKCE code verifier');
      }

      // Exchange code for tokens
      const providerKey = sessionStorage.getItem('oauth_provider') as AuthProvider | null;
      const providerConfig = providerKey ? authProviders[providerKey] : {
        authUrl: `${authConfig.issuer}/auth`,
        tokenUrl: `${authConfig.issuer}/token`,
        userInfoUrl: `${authConfig.issuer}/userinfo`,
        clientId: authConfig.clientId,
        scopes: authConfig.scopes,
      };

      const tokenResponse = await exchangeCodeForTokens(code, codeVerifier, providerConfig);
      
      // Get user info
      const userInfo = await getUserInfo(tokenResponse.access_token, providerConfig);
      
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
      cacheSessionMetadata(newSession);

      // Clean up OAuth session data
      sessionStorage.removeItem('oauth_code_verifier');
      sessionStorage.removeItem('oauth_state');
      sessionStorage.removeItem('oauth_provider');
      
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

async function generatePKCE(): Promise<{codeVerifier: string; codeChallenge: string}> {
  const codeVerifier = generateCodeVerifier(128);
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const codeChallenge = base64URLEncode(digest);
  
  return { codeVerifier, codeChallenge };
}

function generateCodeVerifier(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);
    let secureResult = '';
    for (let i = 0; i < length; i++) {
      secureResult += charset[randomValues[i] % charset.length];
    }
    return secureResult;
  }
  // Fallback for browsers without Web Crypto (should not occur in modern environments)
  let fallbackResult = '';
  for (let i = 0; i < length; i++) {
    fallbackResult += charset[Math.floor(Math.random() * charset.length)];
  }
  return fallbackResult;
}

/**
 * Generate cryptographically secure random string for OAuth state parameter
 * Uses Web Crypto API for true randomness (CSRF protection)
 */
function generateSecureRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
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
    state: generateSecureRandomString(32), // CSRF protection
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

async function exchangeCodeForTokens(code: string, codeVerifier: string, providerConfig: OAuthProviderConfig) {
  const response = await fetch(providerConfig.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: providerConfig.clientId,
      code,
      redirect_uri: getRedirectUri(),
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.statusText}`);
  }

  return response.json();
}

async function getUserInfo(accessToken: string, providerConfig: OAuthProviderConfig): Promise<User> {
  const response = await fetch(providerConfig.userInfoUrl, {
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

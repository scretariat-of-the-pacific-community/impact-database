'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { User, AuthSession } from '@/lib/types';
import { sanitizeReturnUrl, readCookie } from '@/lib/security';
import { oceanPortalApi } from '@/lib/api';

interface AuthContextType {
  user: User | null;
  session: AuthSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  signOut: () => Promise<void>;
  hasRole: (role: string) => boolean;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface CachedSessionMetadata {
  user: User;
  expires_at: number;
  cached_at?: number;
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
      // Cache user data and expiry for offline/fast load
      // Session authentication is maintained via HttpOnly cookies set by backend
      const safePayload: CachedSessionMetadata = {
        user: session.user,
        expires_at: session.expires_at,
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(safePayload));
      // Actual authentication is via HttpOnly cookies sent automatically by browser
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

      // SECURITY FIX: Don't try to read HttpOnly cookie with JavaScript
      // Instead, always call the API which will automatically send the cookie
      // The browser sends HttpOnly cookies automatically with fetch requests

      let resolvedUser = cachedSession?.user ?? null;
      let resolvedExpiry = cachedSession?.expires_at ?? 0;

      const cacheExpired = cachedSession
        ? isCachedSessionExpired(cachedSession)
        : true;

      // BUGFIX: Clear very old cached sessions (> 30 days) to prevent reload loops
      if (cachedSession && cachedSession.cached_at) {
        const cacheAge = Date.now() - cachedSession.cached_at;
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
        if (cacheAge > thirtyDays) {
          console.warn('Clearing very old cached session (>30 days)');
          clearCachedSession();
          setSession(null);
          setUser(null);
          return;
        }
      }

      if (!resolvedUser || cacheExpired) {
        // Try to validate session by calling the API
        // The HttpOnly cookie will be sent automatically by the browser
        try {
          resolvedUser = await oceanPortalApi.getCurrentUser();
          resolvedExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
        } catch (error: any) {
          // API client transforms axios errors to APIError with 'status' property
          const errorStatus = error?.status || error?.response?.status;
          if (errorStatus === 401 || errorStatus === 403) {
            console.log('Session validation failed - clearing cache');
            clearCachedSession();
            setSession(null);
            setUser(null);
            // Stop execution, user will be cleared out
            return;
          } else {
            // Network error or other issue - keep cached session if available
            console.warn(
              'Failed to validate session, keeping cached data:',
              error
            );
            if (cachedSession?.user) {
              resolvedUser = cachedSession.user;
              resolvedExpiry = cachedSession.expires_at;
            } else {
              // No cached user and network error, so we can't proceed
              setSession(null);
              setUser(null);
              return;
            }
          }
        }
      }

      if (!resolvedUser) {
        clearCachedSession();
        setSession(null);
        setUser(null);
        return;
      }

      if (!resolvedExpiry) {
        resolvedExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
      }

      const restoredSession: AuthSession = {
        user: resolvedUser,
        access_token: '', // Token is in HttpOnly cookie, not accessible to JavaScript
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

  // Listen for unauthorized events from API client to sync React state
  useEffect(() => {
    const handleUnauthorized = () => {
      // Immediately clear React state to stop any pending queries
      setUser(null);
      setSession(null);
      setIsLoading(false); // Ensure loading state is cleared to prevent loops
      clearCachedSession();
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  const signOut = async () => {
    try {
      // Call backend logout endpoint to clear HttpOnly cookie
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include',
        });
      } catch (logoutError) {
        console.error('Backend logout failed:', logoutError);
        // Continue with client-side cleanup even if API call fails
      }

      // Clear local state
      setUser(null);
      setSession(null);
      setAuthError(null);
      clearCachedSession();

      // Redirect to login page
      window.location.href = '/auth/login';
    } catch (error) {
      console.error('Sign out failed:', error);
      setAuthError(
        'We were unable to sign you out completely. Please close the tab or try again.'
      );
      // Still clear local state even if remote logout fails
      window.location.href = '/auth/login';
    }
  };

  const hasRole = (role: string): boolean => {
    return user?.roles?.includes(role as any) || false;
  };

  const value: AuthContextType = {
    user,
    session,
    isLoading,
    isAuthenticated,
    signOut,
    hasRole,
    error: authError,
    clearError: () => setAuthError(null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

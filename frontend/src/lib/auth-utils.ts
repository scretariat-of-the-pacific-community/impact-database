/**
 * Authentication utilities for secure token handling
 * Prioritizes httpOnly cookies over localStorage for XSS protection
 */

/**
 * Get authentication token from secure sources
 * Priority: Cookie (httpOnly, XSS-safe) > localStorage (fallback)
 *
 * @deprecated Direct token access - prefer using fetch with credentials: 'include'
 * @returns Auth token or null
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  // Priority 1: Check for httpOnly cookie (most secure)
  // Note: This reads from non-httpOnly cookie as fallback
  // Backend should set httpOnly cookie that browsers send automatically
  const cookieToken = document.cookie
    ?.split('; ')
    .find((row) => row.startsWith('ocean_portal_token='))
    ?.split('=')[1];

  if (cookieToken) {
    return decodeURIComponent(cookieToken);
  }

  // Priority 2: Fallback to localStorage (less secure, XSS vulnerable)
  // This is for backwards compatibility during migration
  return localStorage.getItem('authToken') || localStorage.getItem('token');
}

/**
 * Create authenticated fetch options with credentials
 * Uses automatic cookie handling - more secure than manual Authorization headers
 *
 * @param options - Additional fetch options
 * @returns Fetch options with authentication configured
 */
export function createAuthFetchOptions(options: RequestInit = {}): RequestInit {
  const token = getAuthToken();
  const existingHeaders = options.headers || {};
  const hasAuthHeader =
    typeof existingHeaders === 'object' &&
    'Authorization' in existingHeaders &&
    Boolean((existingHeaders as Record<string, string>).Authorization);

  return {
    ...options,
    credentials: 'include', // Automatically sends httpOnly cookies
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
      ...(token && !hasAuthHeader ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}

/**
 * Get the basePath for Next.js routing
 * This is needed for deployments under a subdirectory like /impact-database/
 */
export function getBasePath(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH || '';
}

/**
 * Prepend basePath to a URL for subdirectory deployments
 * Only affects relative URLs starting with /
 */
export function withBasePath(url: string): string {
  if (!url.startsWith('/')) return url;
  const basePath = getBasePath();
  return `${basePath}${url}`;
}

/**
 * Authenticated fetch wrapper for Next.js API routes
 * Automatically includes credentials for cookie-based auth
 * Prepends basePath for subdirectory deployments
 *
 * Note: Use relative paths (e.g., '/api/admin/users') for Next.js API routes.
 * These routes are handled by Next.js server and work in any deployment.
 * For direct backend API calls, use backendFetch instead.
 *
 * @param url - Relative URL to Next.js API route (e.g., '/api/admin/users')
 * @param options - Fetch options
 * @returns Fetch promise
 */
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const basePath = getBasePath();
  // Prepend basePath for relative URLs starting with /
  const fullUrl = url.startsWith('/') ? `${basePath}${url}` : url;
  return fetch(fullUrl, createAuthFetchOptions(options));
}

/**
 * Authenticated fetch wrapper for direct backend API calls
 * Automatically includes credentials and constructs full backend URL
 *
 * @param url - API path (e.g., '/api/admin/curation/queue')
 * @param options - Fetch options
 * @returns Fetch promise
 */
export function backendFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // Import config inline to avoid SSR issues
  const { config } = require('./config');
  const fullUrl = `${config.API.BASE_URL}${url}`;
  return fetch(fullUrl, createAuthFetchOptions(options));
}

/**
 * Check if user is authenticated
 * @returns Boolean indicating auth status
 */
export function isAuthenticated(): boolean {
  return getAuthToken() !== null;
}

/**
 * Clear authentication tokens (logout)
 */
export function clearAuth(): void {
  if (typeof window === 'undefined') return;

  // Clear localStorage tokens
  localStorage.removeItem('authToken');
  localStorage.removeItem('token');
  localStorage.removeItem('ocean_portal_session');

  // Clear cookie (set Max-Age=0)
  document.cookie =
    'ocean_portal_token=; Max-Age=0; path=/; Secure; SameSite=Strict';
}

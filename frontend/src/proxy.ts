import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Public routes that never require auth
const PUBLIC_PATHS = new Set<string>([
  '/',
  '/auth/login',
  '/auth/callback',
  '/about',
]);

// Matchers are defined in export const config below; keep logic simple here
function requiresAuth(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return false;
  // Additional public assets or api routes can be exempted via config
  return true;
}

export default async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Skip Next internal and asset requests
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/images') ||
    pathname.startsWith('/public')
  ) {
    return NextResponse.next();
  }

  // Only guard configured protected paths
  if (!requiresAuth(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get('ocean_portal_token');

  // If no cookie, redirect to login with returnUrl
  if (!token) {
    const loginUrl = new URL('/auth/login', request.url);
    const returnUrl = pathname + (search || '');
    loginUrl.searchParams.set('returnUrl', returnUrl);
    return NextResponse.redirect(loginUrl);
  }

  // Optionally verify token with backend to prevent stale/invalid cookies
  try {
    const backendBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    // Forward cookie to backend auth check
    const meRes = await fetch(`${backendBase}/api/v1/auth/me`, {
      headers: {
        // Forward only the auth cookie to minimize leakage
        Cookie: `ocean_portal_token=${token.value}`,
      },
      // Avoid caching auth checks
      cache: 'no-store',
    });

    if (!meRes.ok) {
      // Clear cookie and redirect to login
      const response = NextResponse.redirect(new URL('/auth/login', request.url));
      response.cookies.delete('ocean_portal_token');
      const returnUrl = pathname + (search || '');
      response.headers.set('Location', `/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`);
      return response;
    }

    // Token valid; continue
    return NextResponse.next();
  } catch (err) {
    // On verification error, fail closed: redirect to login
    const loginUrl = new URL('/auth/login', request.url);
    const returnUrl = pathname + (search || '');
    loginUrl.searchParams.set('returnUrl', returnUrl);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  // Protect selected routes; other routes are public by default
  matcher: [
    '/profile/:path*',
    '/upload/:path*',
    '/images/:path*/edit',
    '/admin/:path*',
  ],
};

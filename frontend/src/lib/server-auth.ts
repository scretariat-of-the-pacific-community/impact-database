import { cookies } from 'next/headers';

interface ServerAuthState {
  isAuthenticated: boolean;
  user: any | null;
}

export async function getServerAuthState(): Promise<ServerAuthState> {
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get('ocean_portal_token');

  if (!tokenCookie) {
    return { isAuthenticated: false, user: null };
  }

  const backendBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  try {
    const res = await fetch(`${backendBase}/api/v1/auth/me`, {
      headers: {
        Cookie: `ocean_portal_token=${tokenCookie.value}`,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return { isAuthenticated: false, user: null };
    }

    const user = await res.json();
    return { isAuthenticated: true, user };
  } catch {
    return { isAuthenticated: false, user: null };
  }
}

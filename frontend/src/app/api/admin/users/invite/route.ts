import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

/**
 * POST /api/admin/users/invite
 * Proxy to backend admin invite endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const apiUrl = config.API.BASE_URL;

    // Forward the request to the backend
    const response = await fetch(`${apiUrl}/api/admin/users/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward the authorization header
        ...(request.headers.get('Authorization')
          ? { Authorization: request.headers.get('Authorization')! }
          : {}),
        // Forward cookies for session-based auth
        ...(request.headers.get('Cookie')
          ? { Cookie: request.headers.get('Cookie')! }
          : {}),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Admin Invite] Error:', error);
    return NextResponse.json(
      { detail: 'Failed to process invite request' },
      { status: 500 }
    );
  }
}

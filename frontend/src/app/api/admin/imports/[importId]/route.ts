import { NextRequest, NextResponse } from 'next/server';
import config from '@/lib/config';

// Proxy for /api/admin/imports/{id} -> /api/admin/curation/bulk-import/{id}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ importId: string }> }
) {
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map((c) => {
        const [key, ...val] = c.trim().split('=');
        return [key, val.join('=')];
      })
    );

    const rawToken = cookies['ocean_portal_token'];
    const token = rawToken ? decodeURIComponent(rawToken) : null;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { importId } = await params;
    const backendUrl = `${config.API.BASE_URL}/api/admin/curation/bulk-import/${importId}`;

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend import detail error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to fetch import' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Import detail API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

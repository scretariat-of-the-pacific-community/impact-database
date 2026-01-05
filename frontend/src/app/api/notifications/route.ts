import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

/**
 * Notifications API - Proxy to backend or return empty array if not available
 * These endpoints are optional for the Collaboration tab
 */

export async function GET(request: NextRequest) {
  try {
    const apiUrl = config.API.BASE_URL;
    
    const response = await fetch(`${apiUrl}/api/notifications`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(request.headers.get('Authorization') 
          ? { 'Authorization': request.headers.get('Authorization')! }
          : {}),
        ...(request.headers.get('Cookie')
          ? { 'Cookie': request.headers.get('Cookie')! }
          : {}),
      },
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    }
    
    // Backend doesn't have this endpoint yet - return empty array
    return NextResponse.json([]);
  } catch {
    // Gracefully degrade - notifications are optional
    return NextResponse.json([]);
  }
}

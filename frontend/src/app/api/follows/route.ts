import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

/**
 * Follows API - Proxy to backend or return empty array if not available
 * These endpoints are optional for the Collaboration tab
 */

export async function GET(request: NextRequest) {
  try {
    const apiUrl = config.API.BASE_URL;
    
    const response = await fetch(`${apiUrl}/api/follows`, {
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
    // Gracefully degrade - follows are optional
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const apiUrl = config.API.BASE_URL;
    
    const response = await fetch(`${apiUrl}/api/follows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(request.headers.get('Authorization') 
          ? { 'Authorization': request.headers.get('Authorization')! }
          : {}),
        ...(request.headers.get('Cookie')
          ? { 'Cookie': request.headers.get('Cookie')! }
          : {}),
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    }
    
    // Backend doesn't have this endpoint - accept locally
    return NextResponse.json({ success: true, ...body });
  } catch {
    return NextResponse.json({ success: true });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const apiUrl = config.API.BASE_URL;
    
    const response = await fetch(`${apiUrl}/api/follows`, {
      method: 'DELETE',
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
      return NextResponse.json({ success: true });
    }
    
    // Backend doesn't have this endpoint - accept locally
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true });
  }
}

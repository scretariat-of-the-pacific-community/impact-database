import { NextResponse } from 'next/server';

/**
 * Analytics endpoint for tracking user events
 * In development, this is a no-op endpoint that accepts events but doesn't process them
 */
export async function POST(request: Request) {
  try {
    // In development, just accept and log the event
    if (process.env.NODE_ENV === 'development') {
      const body = await request.json();
      console.log('[Analytics]', body.name, body.properties);
      return NextResponse.json({ success: true });
    }

    // In production, you would:
    // 1. Parse the event data
    // 2. Validate the schema
    // 3. Send to analytics service (e.g., Google Analytics, Mixpanel, etc.)
    // 4. Store in database if needed

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Analytics] Error:', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// Handle HEAD requests (used by some analytics libraries)
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

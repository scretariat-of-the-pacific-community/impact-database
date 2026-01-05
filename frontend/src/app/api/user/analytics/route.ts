import { NextRequest, NextResponse } from 'next/server';
import config from '@/lib/config';

export async function GET(request: NextRequest) {
  try {
    // Get token from request cookies directly
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => {
        const [key, ...val] = c.trim().split('=');
        return [key, val.join('=')];
      })
    );
    
    // The app uses 'ocean_portal_token' cookie name, URL-encoded
    const rawToken = cookies['ocean_portal_token'];
    const token = rawToken ? decodeURIComponent(rawToken) : null;
    
    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const days = searchParams.get('days') || '30';
    
    const backendUrl = `${config.API.BASE_URL}/api/user/analytics?days=${days}`;
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      // No token - return empty analytics (graceful fallback)
      return NextResponse.json({
        time_series: [],
        period_days: parseInt(days),
        total_uploads: 0,
        hazard_distribution: {},
        locations: [],
        views_metrics: { total: 0, average_per_upload: 0 },
        engagement_metrics: { impact_score: 0, approval_rate: 0 },
        comparative_benchmarks: {}
      });
    }
    
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers,
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      return NextResponse.json(
        { error: errorData || 'Failed to fetch analytics' },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Analytics proxy error:', error);
    // Return empty analytics data as fallback
    return NextResponse.json({
      time_series: [],
      period_days: 30,
      total_uploads: 0,
      hazard_distribution: {},
      locations: [],
      views_metrics: { total: 0, average_per_upload: 0 },
      engagement_metrics: { impact_score: 0, approval_rate: 0 },
      comparative_benchmarks: {}
    });
  }
}

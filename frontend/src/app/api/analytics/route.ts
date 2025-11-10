import { NextResponse } from 'next/server';

/**
 * Analytics data retrieval endpoint
 * Returns aggregated analytics data for the dashboard
 */
export async function GET() {
  try {
    // Fetch real data from backend API
    const apiUrl = process.env.NEXT_PUBLIC_API_URL_INTERNAL || process.env.NEXT_PUBLIC_API_URL || 'http://api:8000';
    
    try {
      // Get all images from the backend
      const response = await fetch(`${apiUrl}/api/v1/images/search?limit=10000`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch images');
      }
      
      const data = await response.json();
      const images = data.images || [];
      
      // Calculate real statistics
      const hazardDistribution: Record<string, number> = {};
      const countryDistribution: Record<string, number> = {};
      const monthlyUploads: Record<string, number> = {};
      
      images.forEach((image: any) => {
        // Count by hazard type
        if (image.hazard_type) {
          hazardDistribution[image.hazard_type] = (hazardDistribution[image.hazard_type] || 0) + 1;
        }
        
        // Count by country
        if (image.country) {
          countryDistribution[image.country] = (countryDistribution[image.country] || 0) + 1;
        }
        
        // Count by month
        if (image.upload_timestamp || image.date_captured) {
          const date = new Date(image.upload_timestamp || image.date_captured);
          const monthKey = date.toLocaleString('en-US', { month: 'short' });
          monthlyUploads[monthKey] = (monthlyUploads[monthKey] || 0) + 1;
        }
      });
      
      return NextResponse.json({
        totalImages: images.length,
        hazardDistribution,
        countryDistribution,
        monthlyUploads,
        recentActivity: [
          { type: 'images', count: images.length, timestamp: new Date().toISOString() }
        ]
      });
      
    } catch (fetchError) {
      console.error('[Analytics] Error fetching from backend:', fetchError);
      // Return empty data structure instead of mock data
      return NextResponse.json({
        totalImages: 0,
        hazardDistribution: {},
        countryDistribution: {},
        monthlyUploads: {},
        recentActivity: []
      });
    }
  } catch (error) {
    console.error('[Analytics] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}

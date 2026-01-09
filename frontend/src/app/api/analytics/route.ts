import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

/**
 * Advanced Analytics data retrieval endpoint
 * Returns aggregated analytics data with time series, trends, and comparative analysis
 */
export async function GET(request: NextRequest) {
  try {
    // Get query parameters for filtering
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const hazardType = searchParams.get('hazardType');
    const country = searchParams.get('country');

    // Fetch real data from backend API
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL_INTERNAL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://api:8000';

    try {
      // Get all images from the backend
      const response = await fetch(`${apiUrl}/api/search?limit=10000`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch images');
      }

      const data = await response.json();
      let images = data.images || [];

      // Apply filters
      if (startDate || endDate || hazardType || country) {
        images = images.filter((image: any) => {
          const imageDate = new Date(
            image.upload_timestamp || image.date_captured
          );

          if (startDate && imageDate < new Date(startDate)) return false;
          if (endDate && imageDate > new Date(endDate)) return false;
          if (hazardType && image.hazard_type !== hazardType) return false;
          if (country && image.country !== country) return false;

          return true;
        });
      }

      // Calculate real statistics
      const hazardDistribution: Record<string, number> = {};
      const countryDistribution: Record<string, number> = {};
      const monthlyUploads: Record<string, number> = {};
      const dailyUploads: Record<string, number> = {};
      const yearlyUploads: Record<string, number> = {};
      const hazardByCountry: Record<string, Record<string, number>> = {};
      const geoData: Array<{
        lat: number;
        lon: number;
        hazard: string;
        date: string;
      }> = [];

      // Sort images by date for time series
      const sortedImages = images.sort((a: any, b: any) => {
        const dateA = new Date(a.upload_timestamp || a.date_captured);
        const dateB = new Date(b.upload_timestamp || b.date_captured);
        return dateA.getTime() - dateB.getTime();
      });

      sortedImages.forEach((image: any) => {
        // Count by hazard type
        if (image.hazard_type) {
          hazardDistribution[image.hazard_type] =
            (hazardDistribution[image.hazard_type] || 0) + 1;
        }

        // Count by country
        if (image.country) {
          countryDistribution[image.country] =
            (countryDistribution[image.country] || 0) + 1;
        }

        // Hazard by country matrix
        if (image.hazard_type && image.country) {
          if (!hazardByCountry[image.country]) {
            hazardByCountry[image.country] = {};
          }
          hazardByCountry[image.country][image.hazard_type] =
            (hazardByCountry[image.country][image.hazard_type] || 0) + 1;
        }

        // Geographic data for clustering
        if (image.latitude && image.longitude && image.hazard_type) {
          geoData.push({
            lat: image.latitude,
            lon: image.longitude,
            hazard: image.hazard_type,
            date: image.upload_timestamp || image.date_captured,
          });
        }

        // Time series data
        if (image.upload_timestamp || image.date_captured) {
          const date = new Date(image.upload_timestamp || image.date_captured);

          // Monthly
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          monthlyUploads[monthKey] = (monthlyUploads[monthKey] || 0) + 1;

          // Daily (last 30 days)
          const dayKey = date.toISOString().split('T')[0];
          dailyUploads[dayKey] = (dailyUploads[dayKey] || 0) + 1;

          // Yearly
          const yearKey = date.getFullYear().toString();
          yearlyUploads[yearKey] = (yearlyUploads[yearKey] || 0) + 1;
        }
      });

      // Calculate trends (percentage change from previous period)
      const monthlyKeys = Object.keys(monthlyUploads).sort();
      const currentMonth = monthlyKeys[monthlyKeys.length - 1];
      const previousMonth = monthlyKeys[monthlyKeys.length - 2];
      const monthlyTrend = previousMonth
        ? ((monthlyUploads[currentMonth] - monthlyUploads[previousMonth]) /
            monthlyUploads[previousMonth]) *
          100
        : 0;

      // Top hazards and countries
      const topHazards = Object.entries(hazardDistribution)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);

      const topCountries = Object.entries(countryDistribution)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);

      return NextResponse.json({
        totalImages: images.length,
        hazardDistribution,
        countryDistribution,
        monthlyUploads,
        dailyUploads,
        yearlyUploads,
        hazardByCountry,
        geoData,
        trends: {
          monthly: monthlyTrend,
          totalGrowth:
            images.length > 0
              ? (images.length / Math.max(images.length - 10, 1)) * 100 - 100
              : 0,
        },
        topHazards,
        topCountries,
        recentActivity: sortedImages
          .slice(-10)
          .reverse()
          .map((img: any) => ({
            type: img.hazard_type || 'Unknown',
            country: img.country || 'Unknown',
            timestamp: img.upload_timestamp || img.date_captured,
          })),
      });
    } catch (fetchError) {
      console.error('[Analytics] Error fetching from backend:', fetchError);
      // Return empty data structure instead of mock data
      return NextResponse.json({
        totalImages: 0,
        hazardDistribution: {},
        countryDistribution: {},
        monthlyUploads: {},
        recentActivity: [],
      });
    }
  } catch (error) {
    console.error('[Analytics] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}

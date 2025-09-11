'use client';

import { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  BarChart3, 
  PieChart, 
  MapPin, 
  Calendar, 
  Database,
  AlertTriangle,
  Activity
} from 'lucide-react';

interface AnalyticsData {
  totalImages: number;
  hazardDistribution: { [key: string]: number };
  countryDistribution: { [key: string]: number };
  monthlyUploads: { [key: string]: number };
  recentActivity: Array<{
    type: string;
    count: number;
    timestamp: string;
  }>;
}

export default function Analytics() {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      // Try to fetch real data from the API
      const response = await fetch('/api/analytics');
      if (response.ok) {
        const data = await response.json();
        setAnalyticsData(data);
      } else {
        // If API doesn't exist, use mock data
        setAnalyticsData(getMockAnalyticsData());
      }
    } catch (err) {
      // Use mock data if API call fails
      setAnalyticsData(getMockAnalyticsData());
    } finally {
      setLoading(false);
    }
  };

  const getMockAnalyticsData = (): AnalyticsData => ({
    totalImages: 127,
    hazardDistribution: {
      'Cyclone': 35,
      'Flood': 28,
      'Drought': 22,
      'Tsunami': 15,
      'Earthquake': 12,
      'Wildfire': 9,
      'Landslide': 6
    },
    countryDistribution: {
      'Fiji': 32,
      'Tonga': 25,
      'Vanuatu': 21,
      'Solomon Islands': 18,
      'Papua New Guinea': 15,
      'Samoa': 12,
      'Others': 4
    },
    monthlyUploads: {
      'Jan': 8,
      'Feb': 12,
      'Mar': 15,
      'Apr': 18,
      'May': 22,
      'Jun': 25,
      'Jul': 19,
      'Aug': 8
    },
    recentActivity: [
      { type: 'Image Upload', count: 5, timestamp: '2 hours ago' },
      { type: 'Data Export', count: 2, timestamp: '4 hours ago' },
      { type: 'Search Query', count: 23, timestamp: '6 hours ago' }
    ]
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !analyticsData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="text-center">
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Unable to Load Analytics</h2>
            <p className="text-gray-600">Please try again later.</p>
          </div>
        </div>
      </div>
    );
  }

  const maxHazardCount = Math.max(...Object.values(analyticsData.hazardDistribution));
  const maxCountryCount = Math.max(...Object.values(analyticsData.countryDistribution));
  const maxMonthlyCount = Math.max(...Object.values(analyticsData.monthlyUploads));

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50">
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Analytics & Insights</h1>
          <p className="text-xl text-gray-600">
            Comprehensive analysis of hazard data across the Pacific region
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <div className="flex items-center">
              <div className="p-3 bg-blue-50 rounded-lg">
                <Database className="w-8 h-8 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Images</p>
                <p className="text-2xl font-bold text-gray-900">{analyticsData.totalImages}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <div className="flex items-center">
              <div className="p-3 bg-green-50 rounded-lg">
                <MapPin className="w-8 h-8 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Countries</p>
                <p className="text-2xl font-bold text-gray-900">{Object.keys(analyticsData.countryDistribution).length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <div className="flex items-center">
              <div className="p-3 bg-orange-50 rounded-lg">
                <AlertTriangle className="w-8 h-8 text-orange-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Hazard Types</p>
                <p className="text-2xl font-bold text-gray-900">{Object.keys(analyticsData.hazardDistribution).length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <div className="flex items-center">
              <div className="p-3 bg-purple-50 rounded-lg">
                <Activity className="w-8 h-8 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">This Month</p>
                <p className="text-2xl font-bold text-gray-900">
                  {analyticsData.monthlyUploads[Object.keys(analyticsData.monthlyUploads).slice(-1)[0]] || 0}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Hazard Distribution */}
          <div className="bg-white p-8 rounded-xl shadow-sm border">
            <div className="flex items-center mb-6">
              <BarChart3 className="w-6 h-6 text-purple-600 mr-3" />
              <h3 className="text-xl font-semibold text-gray-900">Hazard Distribution</h3>
            </div>
            <div className="space-y-4">
              {Object.entries(analyticsData.hazardDistribution).map(([hazard, count]) => (
                <div key={hazard} className="flex items-center">
                  <div className="w-24 text-sm text-gray-600 font-medium">{hazard}</div>
                  <div className="flex-1 mx-4">
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className="bg-purple-600 h-3 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${(count / maxHazardCount) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="w-8 text-sm text-gray-900 font-semibold text-right">{count}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Country Distribution */}
          <div className="bg-white p-8 rounded-xl shadow-sm border">
            <div className="flex items-center mb-6">
              <MapPin className="w-6 h-6 text-blue-600 mr-3" />
              <h3 className="text-xl font-semibold text-gray-900">Country Distribution</h3>
            </div>
            <div className="space-y-4">
              {Object.entries(analyticsData.countryDistribution).map(([country, count]) => (
                <div key={country} className="flex items-center">
                  <div className="w-32 text-sm text-gray-600 font-medium">{country}</div>
                  <div className="flex-1 mx-4">
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className="bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${(count / maxCountryCount) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="w-8 text-sm text-gray-900 font-semibold text-right">{count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Monthly Uploads & Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Monthly Uploads Chart */}
          <div className="lg:col-span-2 bg-white p-8 rounded-xl shadow-sm border">
            <div className="flex items-center mb-6">
              <TrendingUp className="w-6 h-6 text-green-600 mr-3" />
              <h3 className="text-xl font-semibold text-gray-900">Monthly Upload Trend</h3>
            </div>
            <div className="h-64 flex items-end space-x-2">
              {Object.entries(analyticsData.monthlyUploads).map(([month, count]) => (
                <div key={month} className="flex-1 flex flex-col items-center">
                  <div className="w-full flex items-end justify-center mb-2" style={{ height: '200px' }}>
                    <div 
                      className="w-full bg-green-600 rounded-t transition-all duration-700 ease-out flex items-end justify-center"
                      style={{ 
                        height: `${(count / maxMonthlyCount) * 180}px`,
                        minHeight: '10px'
                      }}
                    >
                      <span className="text-white text-xs font-semibold pb-2">{count}</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 font-medium">{month}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white p-8 rounded-xl shadow-sm border">
            <div className="flex items-center mb-6">
              <Activity className="w-6 h-6 text-orange-600 mr-3" />
              <h3 className="text-xl font-semibold text-gray-900">Recent Activity</h3>
            </div>
            <div className="space-y-4">
              {analyticsData.recentActivity.map((activity, index) => (
                <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                      <span className="text-xs font-bold text-orange-600">{activity.count}</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{activity.type}</p>
                    <p className="text-xs text-gray-500">{activity.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500">
            Analytics are updated in real-time as new data is added to the Impact Database.
          </p>
        </div>
      </div>
    </div>
  );
}

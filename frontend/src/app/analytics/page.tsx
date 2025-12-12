'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown,
  BarChart3, 
  PieChart, 
  MapPin, 
  Calendar, 
  Database,
  AlertTriangle,
  Activity,
  Filter,
  Download,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Globe
} from 'lucide-react';
import dynamic from 'next/dynamic';

// Dynamic import for map to avoid SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });

interface AnalyticsData {
  totalImages: number;
  hazardDistribution: Record<string, number>;
  countryDistribution: Record<string, number>;
  monthlyUploads: Record<string, number>;
  dailyUploads: Record<string, number>;
  yearlyUploads: Record<string, number>;
  hazardByCountry: Record<string, Record<string, number>>;
  geoData: Array<{lat: number, lon: number, hazard: string, date: string}>;
  trends: {
    monthly: number;
    totalGrowth: number;
  };
  topHazards: Array<[string, number]>;
  topCountries: Array<[string, number]>;
  recentActivity: Array<{
    type: string;
    country: string;
    timestamp: string;
  }>;
}

interface Filters {
  startDate: string;
  endDate: string;
  hazardType: string;
  country: string;
  timeRange: 'daily' | 'monthly' | 'yearly';
}

export default function EnhancedAnalytics() {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'charts' | 'map'>('charts');
  const [mounted, setMounted] = useState(false);
  
  const [filters, setFilters] = useState<Filters>({
    startDate: '',
    endDate: '',
    hazardType: '',
    country: '',
    timeRange: 'monthly'
  });

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchAnalyticsData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Build query string
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.hazardType) params.append('hazardType', filters.hazardType);
      if (filters.country) params.append('country', filters.country);
      
      const response = await fetch(`/api/analytics?${params.toString()}`);
      
      if (response.ok) {
        const data = await response.json();
        setAnalyticsData(data);
      } else {
        throw new Error('Failed to fetch analytics');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  const timeSeriesData = useMemo(() => {
    if (!analyticsData) return [];
    
    const data = filters.timeRange === 'daily' 
      ? analyticsData.dailyUploads
      : filters.timeRange === 'yearly'
      ? analyticsData.yearlyUploads
      : analyticsData.monthlyUploads;
    
    return Object.entries(data)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({ key, value }));
  }, [analyticsData, filters.timeRange]);

  const exportData = useCallback(() => {
    if (!analyticsData) return;
    
    const dataStr = JSON.stringify(analyticsData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analytics-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [analyticsData]);

  const exportCSV = useCallback(() => {
    if (!analyticsData) return;
    
    const rows = [
      ['Metric', 'Value'],
      ['Total Images', analyticsData.totalImages.toString()],
      ['Monthly Trend', `${analyticsData.trends.monthly.toFixed(2)}%`],
      ...Object.entries(analyticsData.hazardDistribution).map(([k, v]) => [`Hazard: ${k}`, v.toString()]),
      ...Object.entries(analyticsData.countryDistribution).map(([k, v]) => [`Country: ${k}`, v.toString()])
    ];
    
    const csv = rows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analytics-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [analyticsData]);

  // Prevent hydration mismatch - don't render until mounted
  if (!mounted) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-deep-950 via-deep-900 to-deep-950 text-white">
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
      <div className="min-h-screen bg-gradient-to-b from-deep-950 via-deep-900 to-deep-950 text-white">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="text-center">
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Unable to Load Analytics</h2>
            <p className="text-white/70 mb-4">{error || 'Please try again later.'}</p>
            <button
              onClick={fetchAnalyticsData}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hasData = analyticsData.totalImages > 0;
  const maxHazardCount = Math.max(...Object.values(analyticsData.hazardDistribution), 1);
  const maxCountryCount = Math.max(...Object.values(analyticsData.countryDistribution), 1);
  const maxTimeSeriesCount = Math.max(...timeSeriesData.map(d => d.value), 1);

  return (
    <div className="min-h-screen bg-gradient-to-b from-deep-950 via-deep-900 to-deep-950 text-white">
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Header with Actions */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Analytics & Insights</h1>
            <p className="text-lg text-white/70">
              {hasData ? 'Comprehensive analysis of hazard data across the Pacific region' : 'No data available yet'}
            </p>
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center px-4 py-2 rounded-lg border ${
                showFilters ? 'bg-blue-600 text-white border-blue-600' : 'bg-white/5 text-white/80 border-white/20'
              } hover:shadow-md transition-all`}
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </button>
            
            <button
              onClick={() => setViewMode(viewMode === 'charts' ? 'map' : 'charts')}
              className="inline-flex items-center px-4 py-2 bg-white/5 border border-white/20 text-white/80 rounded-lg hover:shadow-md transition-all"
            >
              {viewMode === 'charts' ? <Globe className="w-4 h-4 mr-2" /> : <BarChart3 className="w-4 h-4 mr-2" />}
              {viewMode === 'charts' ? 'Map View' : 'Charts'}
            </button>
            
            <button
              onClick={exportCSV}
              className="inline-flex items-center px-4 py-2 bg-white/5 border border-white/20 text-white/80 rounded-lg hover:shadow-md transition-all"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </button>
            
            <button
              onClick={fetchAnalyticsData}
              className="inline-flex items-center px-4 py-2 bg-white/5 border border-white/20 text-white/80 rounded-lg hover:shadow-md transition-all"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-white/5 p-6 rounded-xl shadow-card border border-white/10 mb-8">
            <h3 className="text-lg font-semibold text-white mb-4">Filter Analytics</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Start Date</label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({...filters, startDate: e.target.value})}
                  className="w-full rounded-lg border border-white/20 bg-deep-900/60 px-3 py-2 text-white placeholder:text-white/50 focus:border-pacific-300 focus:outline-none focus:ring-2 focus:ring-pacific-400/60"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">End Date</label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({...filters, endDate: e.target.value})}
                  className="w-full rounded-lg border border-white/20 bg-deep-900/60 px-3 py-2 text-white placeholder:text-white/50 focus:border-pacific-300 focus:outline-none focus:ring-2 focus:ring-pacific-400/60"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Hazard Type</label>
                <select
                  value={filters.hazardType}
                  onChange={(e) => setFilters({...filters, hazardType: e.target.value})}
                  className="w-full rounded-lg border border-white/20 bg-deep-900/60 px-3 py-2 text-white focus:border-pacific-300 focus:outline-none focus:ring-2 focus:ring-pacific-400/60"
                >
                  <option value="">All Hazards</option>
                  {Object.keys(analyticsData.hazardDistribution).map(hazard => (
                    <option key={hazard} value={hazard}>{hazard}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Country</label>
                <select
                  value={filters.country}
                  onChange={(e) => setFilters({...filters, country: e.target.value})}
                  className="w-full rounded-lg border border-white/20 bg-deep-900/60 px-3 py-2 text-white focus:border-pacific-300 focus:outline-none focus:ring-2 focus:ring-pacific-400/60"
                >
                  <option value="">All Countries</option>
                  {Object.keys(analyticsData.countryDistribution).map(country => (
                    <option key={country} value={country}>{country}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Time Range</label>
                <select
                  value={filters.timeRange}
                  onChange={(e) => setFilters({...filters, timeRange: e.target.value as Filters['timeRange']})}
                  className="w-full rounded-lg border border-white/20 bg-deep-900/60 px-3 py-2 text-white focus:border-pacific-300 focus:outline-none focus:ring-2 focus:ring-pacific-400/60"
                >
                  <option value="daily">Daily</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Key Metrics with Trends */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/5 p-6 rounded-xl shadow-card border border-white/10">
            <div className="flex items-start justify-between">
              <div className="flex items-center">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <Database className="w-8 h-8 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-white/60">Total Images</p>
                  <p className="text-3xl font-bold text-white">{analyticsData.totalImages}</p>
                </div>
              </div>
              {analyticsData.trends.totalGrowth !== 0 && (
                <div className={`flex items-center text-sm font-semibold ${
                  analyticsData.trends.totalGrowth > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {analyticsData.trends.totalGrowth > 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  {Math.abs(analyticsData.trends.totalGrowth).toFixed(1)}%
                </div>
              )}
            </div>
          </div>

          <div className="bg-white/5 p-6 rounded-xl shadow-card border border-white/10">
            <div className="flex items-start justify-between">
              <div className="flex items-center">
                <div className="p-3 bg-green-50 rounded-lg">
                  <MapPin className="w-8 h-8 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-white/60">Countries</p>
                  <p className="text-3xl font-bold text-white">{Object.keys(analyticsData.countryDistribution).length}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white/5 p-6 rounded-xl shadow-card border border-white/10">
            <div className="flex items-start justify-between">
              <div className="flex items-center">
                <div className="p-3 bg-orange-50 rounded-lg">
                  <AlertTriangle className="w-8 h-8 text-orange-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-white/60">Hazard Types</p>
                  <p className="text-3xl font-bold text-white">{Object.keys(analyticsData.hazardDistribution).length}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white/5 p-6 rounded-xl shadow-card border border-white/10">
            <div className="flex items-start justify-between">
              <div className="flex items-center">
                <div className="p-3 bg-purple-50 rounded-lg">
                  <TrendingUp className="w-8 h-8 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-white/60">Monthly Trend</p>
                  <p className="text-3xl font-bold text-white">
                    {analyticsData.trends.monthly > 0 ? '+' : ''}{analyticsData.trends.monthly.toFixed(1)}%
                  </p>
                </div>
              </div>
              {analyticsData.trends.monthly !== 0 && (
                <div className={`flex items-center ${
                  analyticsData.trends.monthly > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {analyticsData.trends.monthly > 0 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                </div>
              )}
            </div>
          </div>
        </div>

        {viewMode === 'charts' ? (
          <>
            {/* Time Series Chart */}
            <div className="bg-white/5 p-8 rounded-xl shadow-card border border-white/10 mb-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <TrendingUp className="w-6 h-6 text-green-600 mr-3" />
                  <h3 className="text-xl font-semibold text-white">Upload Trend ({filters.timeRange})</h3>
                </div>
                <div className="text-sm text-white/60">
                  {timeSeriesData.length} data points
                </div>
              </div>
              <div className="h-80 flex items-end space-x-1">
                {timeSeriesData.map((item, index) => (
                  <div key={item.key} className="flex-1 flex flex-col items-center group">
                    <div className="w-full flex items-end justify-center" style={{ height: '280px' }}>
                      <div 
                        className="w-full bg-gradient-to-t from-green-600 to-green-400 rounded-t hover:from-green-700 hover:to-green-500 transition-all duration-300 cursor-pointer relative group"
                        style={{ 
                          height: `${(item.value / maxTimeSeriesCount) * 250}px`,
                          minHeight: '10px'
                        }}
                      >
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-white text-xs font-bold bg-black bg-opacity-50 px-2 py-1 rounded">
                            {item.value}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-white/70 font-medium mt-2 truncate w-full text-center">
                      {item.key}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Comparative Analysis */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Top Hazards */}
              <div className="bg-white/5 p-8 rounded-xl shadow-card border border-white/10">
                <div className="flex items-center mb-6">
                  <BarChart3 className="w-6 h-6 text-purple-600 mr-3" />
                  <h3 className="text-xl font-semibold text-white">Top Hazard Types</h3>
                </div>
                <div className="space-y-4">
                  {analyticsData.topHazards.map(([hazard, count], index) => (
                    <div key={hazard} className="flex items-center">
                      <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center mr-3">
                        <span className="text-sm font-bold text-purple-600">{index + 1}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-medium text-white">{hazard}</span>
                          <span className="text-sm font-bold text-white/80">{count}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-purple-600 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${(count / maxHazardCount) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Countries */}
              <div className="bg-white/5 p-8 rounded-xl shadow-card border border-white/10">
                <div className="flex items-center mb-6">
                  <MapPin className="w-6 h-6 text-blue-600 mr-3" />
                  <h3 className="text-xl font-semibold text-white">Top Countries</h3>
                </div>
                <div className="space-y-4">
                  {analyticsData.topCountries.map(([country, count], index) => (
                    <div key={country} className="flex items-center">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                        <span className="text-sm font-bold text-blue-600">{index + 1}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-medium text-white">{country}</span>
                          <span className="text-sm font-bold text-white/80">{count}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${(count / maxCountryCount) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white/5 p-8 rounded-xl shadow-card border border-white/10">
              <div className="flex items-center mb-6">
                <Activity className="w-6 h-6 text-orange-600 mr-3" />
                <h3 className="text-xl font-semibold text-white">Recent Activity</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  {analyticsData.recentActivity.slice(0, 10).map((activity, index) => (
                    <div key={index} className="p-4 bg-gradient-to-br from-white/10 to-white/5 rounded-lg border border-white/15">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-orange-500/15 border border-orange-400/30">
                          <AlertTriangle className="w-5 h-5 text-orange-300" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{activity.type}</p>
                        <p className="text-xs text-white/70 truncate">{activity.country}</p>
                        <p className="text-xs text-white/60 mt-1">
                          {new Date(activity.timestamp).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          /* Map View with Clustering */
          <div className="bg-white/5 p-8 rounded-xl shadow-card border border-white/10">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <Globe className="w-6 h-6 text-blue-600 mr-3" />
                <h3 className="text-xl font-semibold text-white">Geographic Distribution</h3>
              </div>
              <div className="text-sm text-white/70">
                {analyticsData.geoData.length} locations
              </div>
            </div>
            <div className="h-[600px] rounded-lg overflow-hidden">
              {typeof window !== 'undefined' && (
                <MapContainer
                  center={[-18, 178]}
                  zoom={4}
                  style={{ height: '100%', width: '100%' }}
                  className="rounded-lg"
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  />
                  {analyticsData.geoData.map((point, index) => {
                    const colors: Record<string, string> = {
                      flood: '#3b82f6',
                      cyclone: '#8b5cf6',
                      drought: '#eab308',
                      earthquake: '#ef4444',
                      tsunami: '#06b6d4',
                      landslide: '#f97316',
                      wildfire: '#dc2626',
                    };
                    const color = colors[point.hazard.toLowerCase()] || '#6b7280';
                    
                    return (
                      <CircleMarker
                        key={index}
                        center={[point.lat, point.lon]}
                        radius={8}
                        fillColor={color}
                        fillOpacity={0.7}
                        color="#fff"
                        weight={2}
                      >
                        <Popup>
                          <div className="text-sm text-gray-900">
                            <p className="font-semibold">{point.hazard}</p>
                            <p className="text-gray-700 text-xs">
                              {new Date(point.date).toLocaleDateString()}
                            </p>
                            <p className="text-gray-600 text-xs mt-1">
                              {point.lat.toFixed(4)}, {point.lon.toFixed(4)}
                            </p>
                          </div>
                        </Popup>
                      </CircleMarker>
                    );
                  })}
                </MapContainer>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-white/60">
            Analytics are updated in real-time. Last updated: {new Date().toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

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
  Globe,
  FileText,
  Info,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { generateInsights } from '@/lib/insights-engine';
import { exportCSV, exportJSON } from '@/lib/export-utils';
import InsightsPanel from '@/components/InsightsPanel';
import { Select } from '@/components/design-system';
import { getCountryName } from '@/lib/countries';
import { withBasePath } from '@/lib/auth-utils';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from 'recharts';

// Dynamic import for map to avoid SSR issues
const MapContainer = dynamic(
  () => import('react-leaflet').then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((m) => m.TileLayer),
  { ssr: false }
);
const CircleMarker = dynamic(
  () => import('react-leaflet').then((m) => m.CircleMarker),
  { ssr: false }
);
const Popup = dynamic(() => import('react-leaflet').then((m) => m.Popup), {
  ssr: false,
});

interface AnalyticsData {
  totalImages: number;
  hazardDistribution: Record<string, number>;
  countryDistribution: Record<string, number>;
  monthlyUploads: Record<string, number>;
  dailyUploads: Record<string, number>;
  yearlyUploads: Record<string, number>;
  hazardByCountry: Record<string, Record<string, number>>;
  geoData: Array<{ lat: number; lon: number; hazard: string; date: string }>;
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
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'charts' | 'map'>('charts');
  const [mounted, setMounted] = useState(false);
  const [showInsights] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const [filters, setFilters] = useState<Filters>({
    startDate: '',
    endDate: '',
    hazardType: '',
    country: '',
    timeRange: 'monthly',
  });

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchAnalyticsData = useCallback(
    async (signal: AbortSignal) => {
      try {
        setLoading(true);
        setError(null);

        // Build query string
        const params = new URLSearchParams();
        if (filters.startDate) params.append('startDate', filters.startDate);
        if (filters.endDate) params.append('endDate', filters.endDate);
        if (filters.hazardType) params.append('hazardType', filters.hazardType);
        if (filters.country) params.append('country', filters.country);

        const response = await fetch(
          withBasePath(`/api/analytics?${params.toString()}`),
          {
            signal,
          }
        );

        if (response.ok) {
          const data = await response.json();
          setAnalyticsData(data);
          setLastUpdated(new Date().toLocaleString());
        } else {
          throw new Error('Failed to fetch analytics');
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Request was cancelled, ignore
          return;
        }
        setError(
          err instanceof Error ? err.message : 'Failed to load analytics'
        );
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchAnalyticsData(controller.signal);

    return () => controller.abort();
  }, [fetchAnalyticsData]);

  const timeSeriesData = useMemo(() => {
    if (!analyticsData) return [];

    const data =
      filters.timeRange === 'daily'
        ? (analyticsData.dailyUploads ?? {})
        : filters.timeRange === 'yearly'
          ? (analyticsData.yearlyUploads ?? {})
          : (analyticsData.monthlyUploads ?? {});

    return Object.entries(data)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({ key, value, label: key }));
  }, [analyticsData, filters.timeRange]);

  // Generate insights focused on disaster patterns
  const insights = useMemo(() => {
    if (!analyticsData) return [];
    // Filter out generic business recommendations - focus on disaster patterns
    return generateInsights(analyticsData).filter(
      (i) => i.type !== 'recommendation'
    );
  }, [analyticsData]);

  const exportData = useCallback(() => {
    if (!analyticsData) return;
    exportJSON(analyticsData);
  }, [analyticsData]);

  const exportCSVData = useCallback(() => {
    if (!analyticsData) return;
    exportCSV(analyticsData);
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
            <h2 className="text-2xl font-bold text-white mb-2">
              Unable to Load Analytics
            </h2>
            <p className="text-white/70 mb-4">
              {error || 'Please try again later.'}
            </p>
            <button
              onClick={() => {
                const controller = new AbortController();
                fetchAnalyticsData(controller.signal);
              }}
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

  const hazardDistribution = analyticsData.hazardDistribution ?? {};
  const countryDistribution = analyticsData.countryDistribution ?? {};
  const trends = analyticsData.trends ?? { monthly: 0, totalGrowth: 0 };
  const totalImages = analyticsData.totalImages ?? 0;
  const hasData = totalImages > 0;
  const hazardColors: Record<string, string> = {
    flood: '#38bdf8',
    cyclone: '#a855f7',
    drought: '#f59e0b',
    earthquake: '#ef4444',
    tsunami: '#06b6d4',
    landslide: '#f97316',
    wildfire: '#dc2626',
    volcanic: '#fb7185',
  };
  const getHazardColor = (hazard: string) =>
    hazardColors[hazard.toLowerCase()] || '#7dd3fc';

  const topHazards = analyticsData.topHazards ?? [];
  const topCountries = analyticsData.topCountries ?? [];
  const hazardChartData = topHazards.map(([hazard, count]) => ({
    name: hazard,
    count,
    color: getHazardColor(hazard),
  }));

  const countryChartData = topCountries.map(([country, count]) => ({
    code: country,
    name: getCountryName(country),
    count,
  }));

  return (
    <div className="min-h-screen bg-gradient-to-b from-deep-950 via-deep-900 to-deep-950 text-white">
      <div className="max-w-7xl mx-auto px-4 py-12 space-y-10">
        {/* Header with Actions */}
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 shadow-xl shadow-black/20">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pacific-500/15 border border-pacific-400/30 text-sm text-pacific-100">
                <Activity className="w-4 h-4" />
                Live situational intelligence
              </div>
              <div>
                <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">
                  Analytics & Insights
                </h1>
                <p className="text-lg text-white/70">
                  {hasData
                    ? 'Hyper-visual trends for hazard signals across the Pacific'
                    : 'No data available yet'}
                </p>
                {lastUpdated && (
                  <p className="text-xs text-white/50 mt-2">
                    Updated {lastUpdated}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`inline-flex items-center px-4 py-2 rounded-lg border transition-all ${
                  showFilters
                    ? 'bg-pacific-500 text-white border-pacific-500 shadow-lg shadow-pacific-500/30'
                    : 'bg-white/5 text-white/80 border-white/20 hover:border-white/40 hover:-translate-y-0.5'
                }`}
              >
                <Filter className="w-4 h-4 mr-2" />
                Filters
              </button>

              <button
                id="map-toggle"
                onClick={() =>
                  setViewMode(viewMode === 'charts' ? 'map' : 'charts')
                }
                className="inline-flex items-center px-4 py-2 bg-white/5 border border-white/20 text-white/80 rounded-lg hover:-translate-y-0.5 hover:border-white/40 transition-all"
              >
                {viewMode === 'charts' ? (
                  <Globe className="w-4 h-4 mr-2" />
                ) : (
                  <BarChart3 className="w-4 h-4 mr-2" />
                )}
                {viewMode === 'charts' ? 'Map View' : 'Charts'}
              </button>

              <div id="export-dropdown" className="relative group">
                <button className="inline-flex items-center px-4 py-2 bg-white/5 border border-white/20 text-white/80 rounded-lg hover:-translate-y-0.5 hover:border-white/40 transition-all">
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </button>
                <div className="absolute right-0 mt-2 w-48 bg-deep-900/95 backdrop-blur-lg border border-white/10 rounded-xl shadow-2xl shadow-black/30 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                  <button
                    onClick={exportCSVData}
                    className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10 rounded-t-xl flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    Export CSV
                  </button>
                  <button
                    onClick={exportData}
                    className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10 rounded-b-xl flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Export JSON
                  </button>
                </div>
              </div>

              <button
                onClick={() => {
                  const controller = new AbortController();
                  fetchAnalyticsData(controller.signal);
                }}
                className="inline-flex items-center justify-center px-3 py-2 bg-white/5 border border-white/20 text-white/80 rounded-lg hover:-translate-y-0.5 hover:border-white/40 transition-all"
                aria-label="Refresh analytics"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="relative overflow-hidden bg-gradient-to-r from-white/10 via-white/5 to-white/10 p-6 rounded-2xl shadow-2xl border border-white/10 mb-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(124,58,237,0.12),transparent_40%)] pointer-events-none" />
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                  Filter Analytics
                </h3>
                <div className="flex items-center gap-2 text-xs text-white/60">
                  <Info className="w-4 h-4" />
                  <span className="uppercase tracking-widest">
                    {['startDate', 'endDate', 'hazardType', 'country'].some(
                      (key) => (filters as any)[key]
                    )
                      ? 'Filters active'
                      : 'Realtime'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(
                      e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
                    ) => setFilters({ ...filters, startDate: e.target.value })}
                    className="w-full rounded-lg border border-white/20 bg-deep-900/70 px-3 py-2 text-white placeholder:text-white/50 focus:border-pacific-300 focus:outline-none focus:ring-2 focus:ring-pacific-400/60"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(
                      e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
                    ) => setFilters({ ...filters, endDate: e.target.value })}
                    className="w-full rounded-lg border border-white/20 bg-deep-900/70 px-3 py-2 text-white placeholder:text-white/50 focus:border-pacific-300 focus:outline-none focus:ring-2 focus:ring-pacific-400/60"
                  />
                </div>

                <div>
                  <Select
                    label="Hazard Type"
                    value={filters.hazardType}
                    onChange={(
                      e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
                    ) => setFilters({ ...filters, hazardType: e.target.value })}
                    variant="dark"
                    size="md"
                  >
                    <option value="">All Hazards</option>
                    {Object.keys(hazardDistribution).map((hazard) => (
                      <option key={hazard} value={hazard}>
                        {hazard}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Select
                    label="Country"
                    value={filters.country}
                    onChange={(
                      e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
                    ) => setFilters({ ...filters, country: e.target.value })}
                    variant="dark"
                    size="md"
                  >
                    <option value="">All Countries</option>
                    {Object.keys(countryDistribution).map((country) => (
                      <option key={country} value={country}>
                        {getCountryName(country)}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Select
                    label="Time Range"
                    value={filters.timeRange}
                    onChange={(
                      e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
                    ) =>
                      setFilters({
                        ...filters,
                        timeRange: e.target.value as Filters['timeRange'],
                      })
                    }
                    variant="dark"
                    size="md"
                  >
                    <option value="daily">Daily</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Key Metrics with Trends */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[
            {
              label: 'Total Images',
              value: totalImages,
              icon: <Database className="w-6 h-6" />,
              accent: 'from-pacific-500/30 via-pacific-400/20 to-transparent',
              chip: trends.totalGrowth,
            },
            {
              label: 'Countries',
              value: Object.keys(countryDistribution).length,
              icon: <MapPin className="w-6 h-6" />,
              accent: 'from-emerald-500/30 via-emerald-400/20 to-transparent',
              chip: null,
            },
            {
              label: 'Hazard Types',
              value: Object.keys(hazardDistribution).length,
              icon: <AlertTriangle className="w-6 h-6" />,
              accent: 'from-orange-500/25 via-orange-400/15 to-transparent',
              chip: null,
            },
            {
              label: 'Monthly Trend',
              value: `${trends.monthly > 0 ? '+' : ''}${trends.monthly.toFixed(1)}%`,
              icon: <TrendingUp className="w-6 h-6" />,
              accent: 'from-purple-500/30 via-purple-400/20 to-transparent',
              chip: trends.monthly,
            },
          ].map((card, idx) => (
            <div
              key={card.label}
              className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20 hover:-translate-y-1 transition-transform"
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${card.accent}`}
              />
              <div className="relative flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-white/10 border border-white/10 text-white">
                    {card.icon}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest text-white/60">
                      {card.label}
                    </p>
                    <p className="text-3xl font-bold text-white">
                      {card.value}
                    </p>
                  </div>
                </div>
                {card.chip !== null && card.chip !== 0 && (
                  <div
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                      card.chip > 0
                        ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-400/30'
                        : 'bg-red-500/15 text-red-100 border border-red-400/30'
                    }`}
                  >
                    {card.chip > 0 ? (
                      <ArrowUpRight className="w-4 h-4" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4" />
                    )}
                    {Math.abs(card.chip).toFixed(1)}%
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {viewMode === 'charts' ? (
          <>
            {/* Data Insights */}
            {showInsights && insights.length > 0 && (
              <div id="insights-panel">
                <InsightsPanel insights={insights} className="mb-8" />
              </div>
            )}

            {/* Time Series Chart */}
            <div
              id="time-series-chart"
              className="relative overflow-hidden bg-white/5 p-8 rounded-2xl shadow-2xl border border-white/10 mb-8"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-pacific-500/10 via-transparent to-purple-500/10 pointer-events-none" />
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-6 h-6 text-pacific-300" />
                  <div>
                    <h3 className="text-xl font-semibold text-white">
                      Upload Trend ({filters.timeRange})
                    </h3>
                    <p className="text-xs text-white/60">
                      Hover to explore deltas
                    </p>
                  </div>
                </div>
                <div className="text-sm text-white/60">
                  {timeSeriesData.length} data points
                </div>
              </div>
              <div className="h-80">
                <ResponsiveContainer>
                  <AreaChart
                    data={timeSeriesData}
                    margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="timeSeriesGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#38bdf8"
                          stopOpacity={0.7}
                        />
                        <stop
                          offset="95%"
                          stopColor="#38bdf8"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.1)"
                    />
                    <XAxis
                      dataKey="label"
                      stroke="#cbd5e1"
                      tick={{ fill: '#cbd5e1', fontSize: 12 }}
                    />
                    <YAxis
                      stroke="#cbd5e1"
                      tick={{ fill: '#cbd5e1', fontSize: 12 }}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        background: '#0b1220',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 12,
                      }}
                      labelStyle={{ color: '#e2e8f0' }}
                      formatter={(value: number | undefined) => [
                        value,
                        'Uploads',
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#38bdf8"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#timeSeriesGradient)"
                      activeDot={{
                        r: 5,
                        fill: '#22d3ee',
                        stroke: '#fff',
                        strokeWidth: 2,
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Comparative Analysis */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Top Hazards */}
              <div
                id="hazard-chart"
                className="relative overflow-hidden bg-white/5 p-8 rounded-2xl shadow-xl border border-white/10"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-pacific-500/10 pointer-events-none" />
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <BarChart3 className="w-6 h-6 text-purple-300" />
                    <h3 className="text-xl font-semibold text-white">
                      Top Hazard Types
                    </h3>
                  </div>
                  <span className="text-xs text-white/60">
                    Tap a bar to filter
                  </span>
                </div>
                <div className="h-72">
                  <ResponsiveContainer>
                    <BarChart
                      data={hazardChartData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.08)"
                      />
                      <XAxis
                        dataKey="name"
                        stroke="#cbd5e1"
                        tick={{ fill: '#cbd5e1', fontSize: 12 }}
                      />
                      <YAxis
                        stroke="#cbd5e1"
                        tick={{ fill: '#cbd5e1', fontSize: 12 }}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          background: '#0b1220',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 12,
                        }}
                        labelStyle={{ color: '#e2e8f0' }}
                      />
                      <Bar
                        dataKey="count"
                        radius={[8, 8, 2, 2]}
                        onClick={(data: any) =>
                          setFilters({ ...filters, hazardType: data.name })
                        }
                      >
                        {hazardChartData.map((entry, index: any) => (
                          <Cell
                            key={`cell-${entry.name}`}
                            fill={entry.color}
                            cursor="pointer"
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top Countries */}
              <div
                id="country-chart"
                className="relative overflow-hidden bg-white/5 p-8 rounded-2xl shadow-xl border border-white/10"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-emerald-500/10 pointer-events-none" />
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <MapPin className="w-6 h-6 text-blue-300" />
                    <h3 className="text-xl font-semibold text-white">
                      Top Countries
                    </h3>
                  </div>
                  <span className="text-xs text-white/60">
                    Tap a bar to filter
                  </span>
                </div>
                <div className="h-72">
                  <ResponsiveContainer>
                    <BarChart
                      data={countryChartData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.08)"
                      />
                      <XAxis
                        dataKey="name"
                        stroke="#cbd5e1"
                        tick={{ fill: '#cbd5e1', fontSize: 12 }}
                      />
                      <YAxis
                        stroke="#cbd5e1"
                        tick={{ fill: '#cbd5e1', fontSize: 12 }}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          background: '#0b1220',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 12,
                        }}
                        labelStyle={{ color: '#e2e8f0' }}
                      />
                      <Bar
                        dataKey="count"
                        radius={[8, 8, 2, 2]}
                        fill="#38bdf8"
                        onClick={(data: any) =>
                          setFilters({ ...filters, country: data.code })
                        }
                      >
                        {countryChartData.map((entry) => (
                          <Cell
                            key={`cell-country-${entry.code}`}
                            fill="#38bdf8"
                            cursor="pointer"
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="relative overflow-hidden bg-white/5 p-8 rounded-2xl shadow-2xl border border-white/10">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-transparent to-amber-400/10 pointer-events-none" />
              <div className="flex items-center mb-6">
                <Activity className="w-6 h-6 text-orange-600 mr-3" />
                <h3 className="text-xl font-semibold text-white">
                  Recent Activity
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {analyticsData.recentActivity
                  .slice(0, 10)
                  .map((activity, index: any) => (
                    <div
                      key={`${activity.type}-${activity.country}-${activity.timestamp}-${index}`}
                      className="p-4 bg-gradient-to-br from-white/10 to-white/5 rounded-lg border border-white/15"
                    >
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-orange-500/15 border border-orange-400/30">
                            <AlertTriangle className="w-5 h-5 text-orange-300" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">
                            {activity.type}
                          </p>
                          <p className="text-xs text-white/70 truncate">
                            {getCountryName(activity.country)}
                          </p>
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
          <div className="relative overflow-hidden bg-white/5 p-8 rounded-2xl shadow-2xl border border-white/10">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-purple-500/10 pointer-events-none" />
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Globe className="w-6 h-6 text-blue-300" />
                <h3 className="text-xl font-semibold text-white">
                  Geographic Distribution
                </h3>
              </div>
              <div className="flex items-center gap-3 text-sm text-white/70">
                <span>{analyticsData.geoData.length} locations</span>
              </div>
            </div>
            <div className="h-[600px] rounded-lg overflow-hidden relative">
              {typeof window !== 'undefined' && (
                <>
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
                    {analyticsData.geoData.map((point) => {
                      const color = getHazardColor(point.hazard);

                      return (
                        <CircleMarker
                          key={`${point.hazard}-${point.lat}-${point.lon}-${point.date}`}
                          center={[point.lat, point.lon]}
                          radius={8}
                          fillColor={color}
                          fillOpacity={0.7}
                          color="#fff"
                          weight={1.5}
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
                  <div className="absolute bottom-4 left-4 bg-black/60 border border-white/10 rounded-xl p-3 backdrop-blur-sm">
                    <p className="text-xs font-semibold text-white/70 mb-2">
                      Hazard Legend
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs text-white/80">
                      {Object.keys(hazardColors).map((hazard) => (
                        <div key={hazard} className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{ backgroundColor: hazardColors[hazard] }}
                          />
                          <span className="capitalize">{hazard}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-white/60">
            Analytics are updated in real-time. Last updated:{' '}
            {new Date().toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Map as LeafletMap } from 'leaflet';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
} from 'recharts';
import { Download, Gauge, MapPin, TrendingUp, Loader2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { imageApi } from '@/lib/api';
import { getApiUrl } from '@/lib/config';
import { z } from 'zod';
import React from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Zod validation schema for analytics data
const AnalyticsDataSchema = z.object({
  time_series: z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    uploads: z.number().int().nonnegative(),
  })),
  period_days: z.number().int().positive(),
  total_uploads: z.number().int().nonnegative(),
  hazard_distribution: z.record(z.string(), z.number().int().nonnegative()),
  locations: z.array(z.object({
    id: z.string(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    hazard: z.string(),
    country: z.string(),
    uploads: z.number().int().nonnegative(),
  })),
  country_distribution: z.record(z.string(), z.number().int().nonnegative()),
  views_metrics: z.object({
    total: z.number().int().nonnegative(),
    average_per_upload: z.number().nonnegative(),
    max_views: z.number().int().nonnegative(),
  }),
  engagement_metrics: z.object({
    impact_score: z.number().nonnegative(),
    approval_rate: z.number().nonnegative(),
    approved_count: z.number().int().nonnegative(),
    pending_count: z.number().int().nonnegative(),
  }),
  comparative_benchmarks: z.object({
    user_uploads: z.number().int().nonnegative(),
    community_avg_uploads: z.number().nonnegative(),
    user_avg_views: z.number().nonnegative(),
    community_avg_views: z.number().nonnegative(),
  }),
  popular_images: z.array(z.object({
    id: z.string(),
    title: z.string(),
    views: z.number().int().nonnegative(),
  })),
  insights: z.array(z.string()),
});

interface AnalyticsData {
  time_series: Array<{ date: string; uploads: number }>;
  period_days: number;
  total_uploads: number;
  hazard_distribution: Record<string, number>;
  locations: Array<{
    id: string;
    latitude: number;
    longitude: number;
    hazard: string;
    country: string;
    uploads: number;
  }>;
  country_distribution: Record<string, number>;
  views_metrics: {
    total: number;
    average_per_upload: number;
    max_views: number;
  };
  engagement_metrics: {
    impact_score: number;
    approval_rate: number;
    approved_count: number;
    pending_count: number;
  };
  comparative_benchmarks: {
    user_uploads: number;
    community_avg_uploads: number;
    user_avg_views: number;
    community_avg_views: number;
  };
  popular_images: Array<{
    id: string;
    title: string;
    views: number;
  }>;
  insights: string[];
}

const hazardPalette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

const hazardColorMap: Record<string, string> = {
  flood: '#3b82f6',
  cyclone: '#8b5cf6',
  wildfire: '#ef4444',
  earthquake: '#f59e0b',
  tsunami: '#14b8a6',
  landslide: '#f97316',
  drought: '#eab308',
  coastal_erosion: '#06b6d4',
  volcanic_eruption: '#dc2626',
};

function rollingAverage(data: Array<{ date: string; uploads: number }>, window: number) {
  return data.map((item, index) => {
    const start = Math.max(0, index - Math.floor(window / 2));
    const end = Math.min(data.length, index + Math.ceil(window / 2));
    const slice = data.slice(start, end);
    const avg = slice.reduce((sum, d) => sum + d.uploads, 0) / slice.length;
    return { ...item, smoothed: Math.round(avg * 10) / 10 };
  });
}

function getColorForIntensity(count: number): string {
  if (count === 0) return 'bg-slate-900/60';
  if (count < 2) return 'bg-emerald-900/40';
  if (count < 4) return 'bg-emerald-700/60';
  if (count < 6) return 'bg-emerald-500/80';
  return 'bg-emerald-400';
}

function formatPercent(value: number, total: number): string {
  if (total === 0 || !isFinite(value) || !isFinite(total)) return '0';
  const percent = (value / total) * 100;
  return isFinite(percent) ? percent.toFixed(0) : '0';
}

function abbreviateHazard(name: string): string {
  const abbreviations: Record<string, string> = {
    'COASTAL_EROSION': 'COASTAL',
    'COASTAL EROSION': 'COASTAL',
    'VOLCANIC_ERUPTION': 'VOLCANIC',
    'VOLCANIC ERUPTION': 'VOLCANIC',
    'EARTHQUAKE': 'QUAKE',
  };
  
  const key = name.toUpperCase().replace(/ /g, '_');
  return abbreviations[key] || name;
}

function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function formatCsv(rows: Array<Record<string, any>>): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const csvRows = [headers.join(',')];
  rows.forEach((row) => {
    csvRows.push(headers.map((h) => JSON.stringify(row[h] ?? '')).join(','));
  });
  return csvRows.join('\n');
}

export default function UserAnalyticsReal() {
  const [selectedHazard, setSelectedHazard] = useState<string>('');
  const [days, setDays] = useState(30);

  const { data: analyticsData, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ['user-analytics', days],
    queryFn: async () => {
      try {
        const apiUrl = getApiUrl(`api/user/analytics?days=${days}`);
        const response = await fetch(apiUrl, {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Unauthorized');
          }
          throw new Error(`Request failed with status ${response.status}`);
        }
        
        const json = await response.json();
        
        // Validate and sanitize response
        const validated = AnalyticsDataSchema.parse(json);
        return validated;
      } catch (error) {
        if (error instanceof z.ZodError) {
          console.error('Analytics data validation failed:', error.errors);
          throw new Error('Invalid analytics data format');
        }
        throw error;
      }
    },
    staleTime: 60_000, // 1 minute
    retry: 2,
    refetchOnWindowFocus: false,
  });

  // Set initial selected hazard when data loads
  useEffect(() => {
    let isCurrent = true;
    
    if (analyticsData?.hazard_distribution && !selectedHazard) {
      const hazards = Object.keys(analyticsData.hazard_distribution);
      if (hazards.length > 0 && isCurrent) {
        setSelectedHazard(hazards[0]);
      }
    }
    
    return () => {
      isCurrent = false;
    };
  }, [analyticsData, selectedHazard]);

  const pieData = useMemo(() => {
    if (!analyticsData?.hazard_distribution) return [];
    return Object.entries(analyticsData.hazard_distribution).map(([name, value]) => {
      const displayName = name.replace(/_/g, ' ').toUpperCase();
      return {
        name: displayName,
        shortName: abbreviateHazard(displayName),
        value,
        rawName: name,
      };
    });
  }, [analyticsData]);

  const timelineWithRolling = useMemo(() => {
    if (!analyticsData?.time_series) return [];
    return rollingAverage(analyticsData.time_series, 7);
  }, [analyticsData]);

  const calendarData = useMemo(() => {
    if (!analyticsData?.time_series) return {};
    const calendar: Record<string, number> = {};
    analyticsData.time_series.forEach((item) => {
      calendar[item.date] = item.uploads;
    });
    return calendar;
  }, [analyticsData]);

  const calendarWeeks = useMemo(() => {
    const weeks: { date: Date; key: string; count: number }[][] = [];
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 179); // ~6 months
    let currentWeek: { date: Date; key: string; count: number }[] = [];

    for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
      const key = format(d, 'yyyy-MM-dd');
      currentWeek.push({ date: new Date(d), key, count: calendarData[key] || 0 });
      if (d.getDay() === 6) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length) weeks.push(currentWeek);
    return weeks;
  }, [calendarData]);

  const exportJson = () => {
    const payload = {
      analytics: analyticsData,
      exported_at: new Date().toISOString(),
    };
    downloadFile(JSON.stringify(payload, null, 2), 'user-analytics.json', 'application/json');
  };

  const exportCsv = () => {
    if (!analyticsData) return;
    const rows = analyticsData.time_series.map((row) => ({
      date: row.date,
      uploads: row.uploads,
    }));
    downloadFile(formatCsv(rows), 'user-uploads.csv', 'text/csv');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-pacific-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-coral-500 mx-auto mb-4" />
          <p className="text-white font-semibold">Failed to load analytics</p>
          <p className="text-white/60 text-sm mt-2">Please try again later</p>
        </div>
      </div>
    );
  }

  if (!analyticsData || analyticsData.total_uploads === 0) {
    return (
      <div className="mx-auto max-w-7xl space-y-8 p-6">
        <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-12 text-center">
          <p className="text-lg font-semibold text-white">No analytics data yet</p>
          <p className="text-sm text-white/70 mt-2">
            Upload some images to start tracking your contribution metrics
          </p>
        </div>
      </div>
    );
  }

  const benchmarkData = useMemo(() => {
    if (!analyticsData?.comparative_benchmarks) return [];
    
    return [
      {
        metric: 'Uploads',
        user: analyticsData.comparative_benchmarks.user_uploads,
        community: analyticsData.comparative_benchmarks.community_avg_uploads,
      },
      {
        metric: 'Avg. views',
        user: analyticsData.comparative_benchmarks.user_avg_views,
        community: analyticsData.comparative_benchmarks.community_avg_views,
      },
    ];
  }, [analyticsData?.comparative_benchmarks]);

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-gradient-to-r from-slate-900 to-slate-800 p-6 shadow-lg">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">User Analytics</p>
          <h1 className="mt-1 text-3xl font-bold text-white">Your Impact Dashboard</h1>
          <p className="mt-2 text-sm text-white/70">
            Analyzing {analyticsData.total_uploads} uploads over the last {days} days
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Select time range"
            className="rounded-xl border border-white/20 bg-slate-800 px-4 py-2 text-sm text-white"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
          <button
            onClick={exportCsv}
            className="rounded-xl border border-white/20 bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
            aria-label="Export data as CSV"
            title="Export CSV"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={exportJson}
            className="rounded-xl border border-white/20 bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
            aria-label="Export data as JSON"
            title="Export JSON"
          >
            JSON
          </button>
        </div>
      </header>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-pacific-500/20 to-pacific-500/5 p-6">
          <div className="flex items-center justify-between">
            <TrendingUp className="h-8 w-8 text-pacific-300" />
            <p className="text-3xl font-bold text-white">{analyticsData.total_uploads}</p>
          </div>
          <p className="mt-2 text-sm font-semibold text-white">Total Uploads</p>
          <p className="text-xs text-white/60">Last {days} days</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 p-6">
          <div className="flex items-center justify-between">
            <Gauge className="h-8 w-8 text-emerald-300" />
            <p className="text-3xl font-bold text-white">{analyticsData.views_metrics.total}</p>
          </div>
          <p className="mt-2 text-sm font-semibold text-white">Total Views</p>
          <p className="text-xs text-white/60">Avg: {analyticsData.views_metrics.average_per_upload}/upload</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-amber-500/20 to-amber-500/5 p-6">
          <div className="flex items-center justify-between">
            <span className="text-2xl">✨</span>
            <p className="text-3xl font-bold text-white">{analyticsData.engagement_metrics.impact_score}</p>
          </div>
          <p className="mt-2 text-sm font-semibold text-white">Impact Score</p>
          <p className="text-xs text-white/60">{analyticsData.engagement_metrics.approval_rate}% approved</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/20 to-purple-500/5 p-6">
          <div className="flex items-center justify-between">
            <MapPin className="h-8 w-8 text-purple-300" />
            <p className="text-3xl font-bold text-white">{analyticsData.locations.length}</p>
          </div>
          <p className="mt-2 text-sm font-semibold text-white">Locations</p>
          <p className="text-xs text-white/60">{Object.keys(analyticsData.country_distribution).length} countries</p>
        </div>
      </div>

      {/* AI Insights */}
      {analyticsData.insights && analyticsData.insights.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-gradient-to-r from-indigo-900/40 to-purple-900/40 p-6">
          <h3 className="text-lg font-semibold text-white mb-3">📊 AI-Powered Insights</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {analyticsData.insights.map((insight, idx) => (
              <div key={idx} className="rounded-xl bg-white/5 border border-white/10 p-4">
                <p className="text-sm text-white">{insight}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline Chart */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 shadow-lg" role="img" aria-label="Upload timeline with 7-day rolling average">
        <h2 className="text-xl font-semibold text-white mb-4">Upload Timeline</h2>
        <ErrorBoundary>
          <div className="h-80 w-full" style={{ minHeight: '320px', minWidth: '300px' }}>
            <ResponsiveContainer width="100%" height="100%" minHeight={320}>
              <AreaChart data={timelineWithRolling} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorUploads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.6)" />
              <YAxis stroke="rgba(255,255,255,0.6)" />
              <RechartsTooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)' }}
                labelStyle={{ color: '#fff' }}
              />
              <Area
                type="monotone"
                dataKey="uploads"
                stroke="#3b82f6"
                fillOpacity={1}
                fill="url(#colorUploads)"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="smoothed"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                name="7-day average"
              />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ErrorBoundary>
      </div>

      {/* Map and Hazard Distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Map */}
        {analyticsData.locations.length > 0 && (
          <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-lg">
            <h2 className="text-xl font-semibold text-white mb-4">Geographic Distribution</h2>
            <ErrorBoundary>
              <div className="h-96 rounded-xl overflow-hidden">
                <MapContainer
                center={[-18, 178]}
                zoom={3}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={false}
              >
                <TileLayer
                  attribution='&copy; OpenStreetMap'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {analyticsData.locations.map((location) => (
                  <CircleMarker
                    key={location.id}
                    center={[location.latitude, location.longitude]}
                    radius={8}
                    fillColor={hazardColorMap[location.hazard] || '#3b82f6'}
                    color="#fff"
                    weight={2}
                    opacity={0.8}
                    fillOpacity={0.6}
                  >
                    <LeafletTooltip>
                      <div className="text-xs">
                        <p className="font-semibold">{location.country}</p>
                        <p>Hazard: {location.hazard.replace(/_/g, ' ')}</p>
                      </div>
                    </LeafletTooltip>
                  </CircleMarker>
                ))}
                </MapContainer>
              </div>
            </ErrorBoundary>
          </div>
        )}

        {/* Hazard Distribution */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-lg">
          <h2 className="text-xl font-semibold text-white mb-4">Hazard Distribution</h2>
          {pieData.length > 0 ? (
            <ErrorBoundary>
              <ResponsiveContainer width="100%" height={300} minHeight={300}>
                <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                  onClick={(data) => setSelectedHazard(data.rawName)}
                  label={(entry: any) => {
                    const total = pieData.reduce((sum, item) => sum + item.value, 0);
                    const dataEntry = pieData.find(item => item.value === entry.value);
                    const shortName = dataEntry?.shortName || entry.name;
                    return `${shortName} ${formatPercent(entry.value, total)}%`;
                  }}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={hazardPalette[index % hazardPalette.length]} />
                  ))}
                </Pie>
                <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            </ErrorBoundary>
          ) : (
            <p className="text-white/60 text-center py-10">No hazard data available</p>
          )}
        </div>
      </div>

      {/* Popular Images and Benchmarks */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Popular Images */}
        {analyticsData.popular_images.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-lg">
            <h2 className="text-xl font-semibold text-white mb-4">Top Performing Images</h2>
            <div className="space-y-3">
              {analyticsData.popular_images.map((image, index) => (
                <div
                  key={image.id}
                  className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-800/60 px-4 py-3 text-white"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-sm font-semibold">
                      #{index + 1}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{image.title}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-sm text-emerald-200">
                    {image.views} views
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Community Benchmark */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-lg">
          <h2 className="text-xl font-semibold text-white mb-4">Community Benchmark</h2>
          <ErrorBoundary>
            <div className="h-64 w-full" style={{ minHeight: '256px', minWidth: '300px' }}>
              <ResponsiveContainer width="100%" height="100%" minHeight={256}>
                <BarChart data={benchmarkData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="metric" stroke="rgba(255,255,255,0.6)" />
                <YAxis stroke="rgba(255,255,255,0.6)" />
                <Legend />
                <RechartsTooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)' }}
                />
                <Bar dataKey="user" name="You" fill="#22c55e" radius={[6, 6, 0, 0]} />
                <Bar dataKey="community" name="Community Avg" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ErrorBoundary>
        </div>
      </div>

      {/* Contribution Calendar */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-lg">
        <h2 className="text-xl font-semibold text-white mb-4">Contribution Calendar (Last 6 Months)</h2>
        <div className="overflow-x-auto">
          <div className="flex gap-1">
            {calendarWeeks.map((week, weekIndex) => (
              <div key={`week-${weekIndex}`} className="flex flex-col gap-1">
                {week.map((day) => (
                  <div
                    key={day.key}
                    className={clsx('h-4 w-4 rounded-sm border border-white/5 transition', getColorForIntensity(day.count))}
                    title={`${format(day.date, 'MMM d')}: ${day.count} uploads`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-white/70">
          <span className="text-white">Less</span>
          {[0, 1, 3, 5, 7].map((value) => (
            <div key={value} className={clsx('h-4 w-4 rounded-sm border border-white/5', getColorForIntensity(value))} />
          ))}
          <span className="text-white">More</span>
        </div>
      </div>
    </div>
  );
}

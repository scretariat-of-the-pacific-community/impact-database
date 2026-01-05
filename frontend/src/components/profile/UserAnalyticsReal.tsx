'use client';

import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
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
import { HAZARD_TYPE_LABELS, HazardType } from '@/lib/types';
import { Select } from '@/components/design-system';
import { getCountryName } from '@/lib/countries';

const RADIAN = Math.PI / 180;

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

// Colorblind-friendly palette (Okabe-Ito + neutrals)
const hazardPalette = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#F0E442', '#56B4E9', '#E69F00', '#999999'];

// Color map aligned with HazardType enum from lib/types.ts
const hazardColorMap: Record<HazardType | string, string> = {
  earthquake: '#E69F00',      // Orange
  flood: '#0072B2',           // Blue
  tsunami: '#56B4E9',         // Light blue
  cyclone: '#CC79A7',         // Pink
  drought: '#F0E442',         // Yellow
  landslide: '#009E73',       // Green
  wildfire: '#D55E00',        // Red-orange
  volcanic: '#332288',        // Deep purple
  coastal_erosion: '#999999', // Gray
  other: '#666666',           // Dark gray
};

// Helper to get display label for hazard type
const getHazardLabel = (hazard: string): string => {
  return HAZARD_TYPE_LABELS[hazard as HazardType] || 
    hazard.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

// Helper to get color for hazard type
const getHazardColor = (hazard: string): string => {
  return hazardColorMap[hazard as HazardType] || hazardColorMap.other || '#3b82f6';
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

interface UserAnalyticsRealProps {
  /** When false, the component is hidden and should pause polling/heavy operations */
  isActive?: boolean;
}

export default function UserAnalyticsReal({ isActive = true }: UserAnalyticsRealProps) {
  const [selectedHazard, setSelectedHazard] = useState<string>('');
  const [days, setDays] = useState(30);

  const { data: analyticsData, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ['user-analytics', days],
    queryFn: async () => {
      // Use relative URL to go through Next.js API proxy
      const response = await fetch(`/api/user/analytics?days=${days}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch analytics');
      return response.json();
    },
    staleTime: 60000, // 1 minute
  });

  // Set initial selected hazard when data loads
  useEffect(() => {
    if (analyticsData?.hazard_distribution && !selectedHazard) {
      const hazards = Object.keys(analyticsData.hazard_distribution);
      if (hazards.length > 0) {
        setSelectedHazard(hazards[0]);
      }
    }
  }, [analyticsData, selectedHazard]);

  const pieData = useMemo(() => {
    if (!analyticsData?.hazard_distribution) return [];
    return Object.entries(analyticsData.hazard_distribution).map(([name, value]) => ({
      name: getHazardLabel(name),
      value,
      rawName: name,
      color: getHazardColor(name),
    }));
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

  const mapBounds = useMemo(() => {
    if (!analyticsData?.locations?.length) {
      return [
        [-18, 178],
      ];
    }
    const lats = analyticsData.locations.map((l) => l.latitude);
    const lons = analyticsData.locations.map((l) => l.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const spanLon = Math.max(...lons) - Math.min(...lons);
    // Handle anti-meridian by normalizing longitudes for smallest span
    const normalizedLons =
      spanLon > 180
        ? lons.map((lon) => (lon < 0 ? lon + 360 : lon))
        : lons;
    const minLon = Math.min(...normalizedLons);
    const maxLon = Math.max(...normalizedLons);
    return [
      [minLat, minLon > 180 ? minLon - 360 : minLon],
      [maxLat, maxLon > 180 ? maxLon - 360 : maxLon],
    ];
  }, [analyticsData?.locations]);

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

  const benchmarkData = [
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

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-gradient-to-r from-slate-900 to-slate-800 p-6 shadow-lg">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Period Analytics</p>
          <h1 className="mt-1 text-3xl font-bold text-white">Time-Range Dashboard</h1>
          <p className="mt-2 text-sm text-white/70">
            Showing {analyticsData.total_uploads} uploads from the last {days} days
          </p>
        </div>
        <div className="flex gap-2">
          <Select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            variant="dark"
            size="sm"
            fullWidth={false}
            aria-label="Select time period"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </Select>
          <button
            onClick={exportCsv}
            className="rounded-xl border border-white/20 bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pacific-400 focus-visible:ring-offset-2 focus-visible:ring-offset-deep-950"
            title="Export CSV"
            aria-label="Export data as CSV"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            onClick={exportJson}
            className="rounded-xl border border-white/20 bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pacific-400 focus-visible:ring-offset-2 focus-visible:ring-offset-deep-950"
            title="Export JSON"
            aria-label="Export data as JSON"
          >
            JSON
          </button>
        </div>
      </header>

      {/* Key Metrics - Period Specific */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-pacific-500/20 to-pacific-500/5 p-6">
          <div className="flex items-center justify-between">
            <TrendingUp className="h-8 w-8 text-pacific-300" />
            <p className="text-3xl font-bold text-white">{analyticsData.total_uploads}</p>
          </div>
          <p className="mt-2 text-sm font-semibold text-white">Period Uploads</p>
          <p className="text-xs text-white/60">Last {days} days</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 p-6">
          <div className="flex items-center justify-between">
            <Gauge className="h-8 w-8 text-emerald-300" />
            <p className="text-3xl font-bold text-white">{analyticsData.views_metrics.total}</p>
          </div>
          <p className="mt-2 text-sm font-semibold text-white">Period Views</p>
          <p className="text-xs text-white/60">Avg: {analyticsData.views_metrics.average_per_upload}/upload</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-amber-500/20 to-amber-500/5 p-6">
          <div className="flex items-center justify-between">
            <span className="text-2xl">✨</span>
            <p className="text-3xl font-bold text-white">{analyticsData.engagement_metrics.impact_score}</p>
          </div>
          <p className="mt-2 text-sm font-semibold text-white">Period Impact</p>
          <p className="text-xs text-white/60">{analyticsData.engagement_metrics.approval_rate}% approved in period</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/20 to-purple-500/5 p-6">
          <div className="flex items-center justify-between">
            <MapPin className="h-8 w-8 text-purple-300" />
            <p className="text-3xl font-bold text-white">{analyticsData.locations.length}</p>
          </div>
          <p className="mt-2 text-sm font-semibold text-white">Period Locations</p>
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
      <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 shadow-lg">
        <h2 className="text-xl font-semibold text-white mb-4">Upload Timeline</h2>
        <div className="h-80 min-w-0" style={{ minHeight: '320px' }}>
          <ResponsiveContainer width="100%" height={320} minWidth={120} minHeight={200}>
            <AreaChart data={timelineWithRolling} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorUploads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.6)" />
              <YAxis
                stroke="rgba(255,255,255,0.6)"
                label={{ value: 'Uploads', angle: -90, position: 'insideLeft', fill: '#cbd5e1' }}
              />
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
      </div>

      {/* Map and Hazard Distribution */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Map */}
            {analyticsData.locations.length > 0 && (
              <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-lg">
                <h2 className="text-xl font-semibold text-white mb-4">Geographic Distribution</h2>
                <div className="h-96 rounded-xl overflow-hidden">
                  <MapContainer
                    bounds={mapBounds as any}
                    boundsOptions={{ padding: [20, 20] }}
                    style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom={false}
                    worldCopyJump
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
                    fillColor={getHazardColor(location.hazard)}
                    color="#fff"
                    weight={2}
                    opacity={0.8}
                    fillOpacity={0.6}
                  >
                    <LeafletTooltip>
                      <div className="text-xs">
                        <p className="font-semibold">{getCountryName(location.country)}</p>
                        <p>Hazard: {getHazardLabel(location.hazard)}</p>
                      </div>
                    </LeafletTooltip>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
          </div>
        )}

        {/* Hazard Distribution */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-lg">
          <h2 className="text-xl font-semibold text-white mb-4">Hazard Distribution</h2>
          {pieData.length > 0 ? (
            <div className="min-w-0" style={{ minHeight: '300px' }}>
              <ResponsiveContainer width="100%" height={300} minWidth={120} minHeight={200}>
                <PieChart margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    paddingAngle={2}
                    fill="#8884d8"
                    dataKey="value"
                    onClick={(data) => setSelectedHazard(data.rawName)}
                    label={({ cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius: r = 0, name, percent }) => {
                      const radius = innerRadius + (r - innerRadius) * 0.65;
                      const x = cx + radius * Math.cos(-midAngle * RADIAN);
                      const y = cy + radius * Math.sin(-midAngle * RADIAN);
                      return (
                        <text
                          x={x}
                          y={y}
                          fill="white"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="text-sm"
                        >
                          {`${name} ${(percent * 100).toFixed(0)}%`}
                        </text>
                      );
                    }}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-white/60 text-center py-10">No hazard data available</p>
          )}
        </div>
      </div>

      {/* Accessible data tables for screen readers */}
      <div className="sr-only" aria-live="polite">
        <h2>Upload timeline data</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Uploads</th>
              <th>7-day average</th>
            </tr>
          </thead>
          <tbody>
            {timelineWithRolling.slice(-14).map((row) => (
              <tr key={row.date}>
                <td>{row.date}</td>
                <td>{row.uploads}</td>
                <td>{row.smoothed ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>Hazard distribution</h2>
        <table>
          <thead>
            <tr>
              <th>Hazard</th>
              <th>Uploads</th>
            </tr>
          </thead>
          <tbody>
            {pieData.map((item) => (
              <tr key={item.rawName}>
                <td>{item.name}</td>
                <td>{item.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
          <div className="h-64 min-w-0" style={{ minHeight: '256px' }}>
            <ResponsiveContainer width="100%" height={256} minWidth={120} minHeight={150}>
              <BarChart data={benchmarkData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="metric" stroke="rgba(255,255,255,0.6)" />
                <YAxis
                  stroke="rgba(255,255,255,0.6)"
                  label={{ value: 'Views', angle: -90, position: 'insideLeft', fill: '#cbd5e1' }}
                />
                <Legend />
                <RechartsTooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)' }}
                />
                <Bar dataKey="user" name="You" fill="#22c55e" radius={[6, 6, 0, 0]} />
                <Bar dataKey="community" name="Community Avg" fill="#38bdf8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
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

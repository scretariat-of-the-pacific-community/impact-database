'use client';

import { useMemo, useState } from 'react';
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
import { Download, Gauge, MapPin, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';

interface UploadLocation {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  hazard: string;
  uploads: number;
}

interface HazardDrilldownItem {
  id: string;
  title: string;
  region: string;
  uploads: number;
  views: number;
  citations: number;
}

const hazardCategories: Record<string, HazardDrilldownItem[]> = {
  Flood: [
    { id: 'f1', title: 'Coastal surge assessment', region: 'Fiji', uploads: 16, views: 820, citations: 12 },
    { id: 'f2', title: 'River delta watch', region: 'Bangladesh', uploads: 12, views: 560, citations: 8 },
    { id: 'f3', title: 'Urban flash flood audit', region: 'Philippines', uploads: 9, views: 420, citations: 5 },
  ],
  Cyclone: [
    { id: 'c1', title: 'Typhoon path imagery', region: 'Philippines', uploads: 8, views: 640, citations: 11 },
    { id: 'c2', title: 'Cyclone Harold rebuild', region: 'Vanuatu', uploads: 7, views: 320, citations: 6 },
  ],
  Wildfire: [
    { id: 'w1', title: 'Forest edge patrol', region: 'Indonesia', uploads: 6, views: 410, citations: 4 },
    { id: 'w2', title: 'Peatland hotspot study', region: 'Malaysia', uploads: 5, views: 260, citations: 3 },
  ],
  Heatwave: [
    { id: 'h1', title: 'Urban heat mapping', region: 'Australia', uploads: 10, views: 500, citations: 7 },
  ],
};

const uploadLocations: UploadLocation[] = [
  { id: 'loc-1', label: 'Suva', latitude: -18.1248, longitude: 178.4501, hazard: 'Cyclone', uploads: 12 },
  { id: 'loc-2', label: 'Manila', latitude: 14.5995, longitude: 120.9842, hazard: 'Flood', uploads: 22 },
  { id: 'loc-3', label: 'Jakarta', latitude: -6.2088, longitude: 106.8456, hazard: 'Flood', uploads: 18 },
  { id: 'loc-4', label: 'Kuala Lumpur', latitude: 3.139, longitude: 101.6869, hazard: 'Heatwave', uploads: 11 },
  { id: 'loc-5', label: 'Port Vila', latitude: -17.7333, longitude: 168.3273, hazard: 'Cyclone', uploads: 8 },
  { id: 'loc-6', label: 'Palembang', latitude: -2.9761, longitude: 104.7754, hazard: 'Wildfire', uploads: 9 },
  { id: 'loc-7', label: 'Cebu', latitude: 10.3157, longitude: 123.8854, hazard: 'Flood', uploads: 14 },
  { id: 'loc-8', label: 'Sydney', latitude: -33.8688, longitude: 151.2093, hazard: 'Heatwave', uploads: 6 },
];

const timelineSeries = [
  { date: '2024-10-01', uploads: 3, views: 120 },
  { date: '2024-10-08', uploads: 5, views: 220 },
  { date: '2024-10-15', uploads: 4, views: 260 },
  { date: '2024-10-22', uploads: 7, views: 310 },
  { date: '2024-10-29', uploads: 6, views: 290 },
  { date: '2024-11-05', uploads: 8, views: 350 },
  { date: '2024-11-12', uploads: 9, views: 420 },
  { date: '2024-11-19', uploads: 10, views: 480 },
  { date: '2024-11-26', uploads: 8, views: 450 },
  { date: '2024-12-03', uploads: 11, views: 520 },
  { date: '2024-12-10', uploads: 12, views: 610 },
  { date: '2024-12-17', uploads: 9, views: 530 },
  { date: '2024-12-24', uploads: 14, views: 700 },
  { date: '2024-12-31', uploads: 13, views: 740 },
];

const popularImages = [
  { id: 'img-1', title: 'Harbor surge baseline', views: 940, citations: 18 },
  { id: 'img-2', title: 'Flooded lowlands aerial', views: 860, citations: 15 },
  { id: 'img-3', title: 'Cyclone damage corridor', views: 780, citations: 11 },
];

const communityBenchmark = [
  { metric: 'Uploads', user: 138, community: 96 },
  { metric: 'Avg. views per upload', user: 54, community: 41 },
  { metric: 'Citations', user: 46, community: 28 },
];

const contributionCalendar: Record<string, number> = {};
const today = new Date('2024-12-31');
for (let i = 0; i < 180; i += 1) {
  const date = new Date(today);
  date.setDate(today.getDate() - i);
  const key = format(date, 'yyyy-MM-dd');
  contributionCalendar[key] = Math.floor(Math.random() * 6);
}

const hazardPalette = ['#0ea5e9', '#a78bfa', '#f59e0b', '#ef4444'];

// Intensity thresholds for contribution calendar coloring
// Values represent the minimum number of contributions for each activity level
const VERY_HIGH_ACTIVITY_THRESHOLD = 12; // Very high activity
const HIGH_ACTIVITY_THRESHOLD = 8; // High activity
const MEDIUM_ACTIVITY_THRESHOLD = 5; // Medium activity
const LOW_ACTIVITY_THRESHOLD = 3; // Low activity
const MINIMAL_ACTIVITY_THRESHOLD = 1; // Minimal activity

const getColorForIntensity = (value: number) => {
  if (value >= VERY_HIGH_ACTIVITY_THRESHOLD) return 'fill-green-500/80';
  if (value >= HIGH_ACTIVITY_THRESHOLD) return 'fill-emerald-400/70';
  if (value >= MEDIUM_ACTIVITY_THRESHOLD) return 'fill-lime-300/70';
  if (value >= LOW_ACTIVITY_THRESHOLD) return 'fill-amber-300/70';
  if (value >= MINIMAL_ACTIVITY_THRESHOLD) return 'fill-orange-300/70';
  return 'fill-slate-800';
};

const rollingAverage = (data: typeof timelineSeries, windowSize: number) =>
  data.map((point, index) => {
    const windowStart = Math.max(0, index - windowSize + 1);
    const window = data.slice(windowStart, index + 1);
    const avgUploads = window.reduce((sum, item) => sum + item.uploads, 0) / window.length;
    return { ...point, rolling: Number(avgUploads.toFixed(2)) };
  });

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// Escape a value for CSV according to RFC 4180 and mitigate CSV injection
function escapeCsvValue(value: string | number): string {
  let str = String(value);
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
  str = str.replace(/"/g, '""');
  if (/[",\n\r]/.test(str)) {
    str = `"${str}"`;
  }
  return str;
}

function formatCsv(rows: Record<string, string | number>[]) {
  const headers = Object.keys(rows[0]);
  const csvRows = rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(','));
  return [headers.join(','), ...csvRows].join('\n');
}

export default function UserAnalytics() {
  const [selectedHazard, setSelectedHazard] = useState<string>('Flood');
  const pieData = useMemo(
    () =>
      Object.entries(hazardCategories).map(([name, items]) => ({
        name,
        value: items.reduce((sum, item) => sum + item.uploads, 0),
      })),
    [],
  );

  const timelineWithRolling = useMemo(() => rollingAverage(timelineSeries, 7), []);

  const totals = useMemo(() => {
    const uploads = timelineSeries.reduce((sum, item) => sum + item.uploads, 0);
    const views = timelineSeries.reduce((sum, item) => sum + item.views, 0);
    const citations = Object.values(hazardCategories)
      .flat()
      .reduce((sum, item) => sum + item.citations, 0);
    return { uploads, views, averageViews: Math.round(views / uploads), citations };
  }, []);

  const calendarWeeks = useMemo(() => {
    const weeks: { date: Date; key: string; count: number }[][] = [];
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 179);
    let currentWeek: { date: Date; key: string; count: number }[] = [];

    for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
      const key = format(d, 'yyyy-MM-dd');
      currentWeek.push({ date: new Date(d), key, count: contributionCalendar[key] || 0 });
      if (d.getDay() === 6) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length) weeks.push(currentWeek);
    return weeks;
  }, []);

  const hazardLegend = useMemo(
    () =>
      pieData.reduce(
        (acc, item, index) => ({ ...acc, [item.name]: hazardPalette[index % hazardPalette.length] }),
        {} as Record<string, string>,
      ),
    [pieData],
  );

  const exportJson = () => {
    const payload = {
      uploads: timelineSeries,
      hazards: hazardCategories,
      locations: uploadLocations,
      popularImages,
      benchmark: communityBenchmark,
    };
    downloadFile(JSON.stringify(payload, null, 2), 'user-analytics.json', 'application/json');
  };

  const exportCsv = () => {
    const rows = timelineSeries.map((row) => ({ date: row.date, uploads: row.uploads, views: row.views }));
    downloadFile(formatCsv(rows), 'user-uploads.csv', 'text/csv');
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-gradient-to-r from-slate-900 to-slate-800 p-6 shadow-lg">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">User analytics</p>
          <h1 className="text-3xl font-semibold text-white">Performance overview</h1>
          <p className="text-slate-300">Geospatial coverage, hazard mix, timelines, and peer benchmarking in one dashboard.</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-white/10"
            onClick={exportCsv}
          >
            <Download className="h-4 w-4" /> CSV
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:-translate-y-0.5 hover:bg-emerald-500/20"
            onClick={exportJson}
          >
            <Download className="h-4 w-4" /> JSON
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-lg">
          <div className="flex items-center justify-between gap-2 pb-3">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Geographic coverage</p>
              <h2 className="text-xl font-semibold text-white">Uploads map & heat intensity</h2>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs text-white">
              <MapPin className="h-4 w-4 text-emerald-300" /> {uploadLocations.length} locations mapped
            </div>
          </div>
          <div className="h-[420px] overflow-hidden rounded-xl border border-white/5">
            <MapContainer center={[-2.8, 135.9]} zoom={3} scrollWheelZoom className="h-full w-full">
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {uploadLocations.map((location) => (
                <CircleMarker
                  key={location.id}
                  center={[location.latitude, location.longitude]}
                  radius={8 + location.uploads / 2}
                  pathOptions={{
                    color: hazardLegend[location.hazard] || '#0ea5e9',
                    fillColor: hazardLegend[location.hazard] || '#0ea5e9',
                    fillOpacity: 0.55,
                    weight: 1,
                  }}
                >
                  <LeafletTooltip direction="top" offset={[0, -2]}>
                    <div className="space-y-1">
                      <p className="font-semibold">{location.label}</p>
                      <p className="text-xs">Hazard: {location.hazard}</p>
                      <p className="text-xs">Uploads: {location.uploads}</p>
                    </div>
                  </LeafletTooltip>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Hazard mix</p>
                <h2 className="text-xl font-semibold text-white">Distribution & drill-down</h2>
              </div>
              <div className="rounded-full bg-white/5 px-3 py-1 text-xs text-white">Click a slice to drill down</div>
            </div>
            <div className="h-72">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={90}
                    onClick={(entry) => setSelectedHazard(entry.name)}
                  >
                    {pieData.map((entry, index) => (
                      <Cell
                        key={entry.name}
                        role="button"
                        tabIndex={0}
                        aria-label={`Select ${entry.name} hazard category`}
                        onClick={() => setSelectedHazard(entry.name)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedHazard(entry.name);
                          }
                        }}
                        fill={hazardPalette[index % hazardPalette.length]}
                        opacity={entry.name === selectedHazard ? 1 : 0.6}
                        className="cursor-pointer"
                      />
                    ))}
                  </Pie>
                  <Legend />
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 space-y-2 rounded-xl bg-white/5 p-3">
              <div className="flex items-center justify-between text-sm text-white">
                <span className="font-medium">{selectedHazard} details</span>
                <span className="text-white/70">
                  {hazardCategories[selectedHazard]?.reduce((sum, item) => sum + item.uploads, 0) || 0} uploads
                </span>
              </div>
              <div className="space-y-2">
                {hazardCategories[selectedHazard]?.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-white/5 bg-slate-800/60 px-3 py-2 text-sm text-white"
                  >
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="text-xs text-white/60">{item.region}</p>
                    </div>
                    <div className="flex gap-4 text-xs text-white/80">
                      <span className="flex items-center gap-1"><TrendingUp className="h-4 w-4" /> {item.views}</span>
                      <span className="flex items-center gap-1"><Gauge className="h-4 w-4" /> {item.citations} citations</span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5">{item.uploads} uploads</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/10 bg-slate-900/80 p-3 text-white">
              <p className="text-xs text-white/60">Views per upload</p>
              <p className="text-2xl font-semibold">{totals.averageViews}</p>
              <p className="text-xs text-emerald-300">+18% vs. last month</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/80 p-3 text-white">
              <p className="text-xs text-white/60">Total citations</p>
              <p className="text-2xl font-semibold">{totals.citations}</p>
              <p className="text-xs text-emerald-300">Peer recognition rising</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/80 p-3 text-white">
              <p className="text-xs text-white/60">Most popular</p>
              <p className="text-2xl font-semibold">{popularImages[0].views}</p>
              <p className="text-xs text-emerald-300">{popularImages[0].title}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-lg">
          <div className="flex items-center justify-between pb-3">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Timeline</p>
              <h2 className="text-xl font-semibold text-white">Uploads with 7-day rolling average</h2>
            </div>
            <div className="rounded-full bg-white/5 px-3 py-1 text-xs text-white">
              {totals.uploads} uploads · {totals.views} views
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer>
              <AreaChart data={timelineWithRolling} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorUploads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" tickFormatter={(value) => format(new Date(value), 'MMM d')} stroke="rgba(255,255,255,0.6)" />
                <YAxis stroke="rgba(255,255,255,0.6)" />
                <RechartsTooltip labelFormatter={(value) => format(new Date(value), 'MMM d, yyyy')} />
                <Area type="monotone" dataKey="uploads" stroke="#22d3ee" fillOpacity={1} fill="url(#colorUploads)" />
                <Line type="monotone" dataKey="rolling" stroke="#a855f7" strokeWidth={2} dot={false} name="7d avg" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-lg">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Impact leaderboard</p>
          <h2 className="text-xl font-semibold text-white">Most popular images</h2>
          <div className="mt-3 space-y-3">
            {popularImages.map((image, index) => (
              <div
                key={image.id}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-800/60 px-3 py-3 text-white"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-sm font-semibold">
                    #{index + 1}
                  </div>
                  <div>
                    <p className="font-semibold">{image.title}</p>
                    <p className="text-xs text-white/60">{image.citations} citations</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-sm text-emerald-200">{image.views} views</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-lg">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Benchmarking</p>
          <h2 className="text-xl font-semibold text-white">You vs. community average</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={communityBenchmark} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="metric" stroke="rgba(255,255,255,0.6)" />
                <YAxis stroke="rgba(255,255,255,0.6)" />
                <Legend />
                <RechartsTooltip />
                <Bar dataKey="user" name="You" fill="#22c55e" radius={[6, 6, 0, 0]} />
                <Bar dataKey="community" name="Community" fill="#38bdf8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-lg">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Contribution cadence</p>
          <h2 className="text-xl font-semibold text-white">Monthly calendar heatmap</h2>
          <div className="mt-4 overflow-x-auto">
            <div className="flex gap-1">
              {calendarWeeks.map((week, weekIndex) => (
                <div key={`week-${weekIndex}`} className="flex flex-col gap-1">
                  {week.map((day) => (
                    <div
                      key={day.key}
                      className={clsx(
                        'h-4 w-4 rounded-sm border border-white/5 transition',
                        getColorForIntensity(day.count),
                      )}
                      title={`${format(day.date, 'MMM d')}: ${day.count} uploads`}
                      aria-label={`${format(day.date, 'MMMM d')}: ${day.count} uploads`}
                    >
                      <span className="sr-only">{`${format(day.date, 'MMMM d')}: ${day.count} uploads`}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/70">
            <span className="text-white">Legend:</span>
            {[0, MINIMAL_ACTIVITY_THRESHOLD, LOW_ACTIVITY_THRESHOLD, MEDIUM_ACTIVITY_THRESHOLD, HIGH_ACTIVITY_THRESHOLD, VERY_HIGH_ACTIVITY_THRESHOLD].map((value) => (
              <div key={value} className="flex items-center gap-1">
                <div className={clsx('h-4 w-4 rounded-sm border border-white/5', getColorForIntensity(value))} />
                <span>{value}+ uploads</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

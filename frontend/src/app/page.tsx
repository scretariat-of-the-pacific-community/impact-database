'use client';

import { useMemo, useState, useCallback, useEffect, type ComponentType } from 'react';
import nextDynamic from 'next/dynamic';
import Link from 'next/link';
import NextImage from 'next/image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { motion } from 'framer-motion';
import {
  Waves,
  MapPin,
  Search,
  Filter,
  Globe,
  TrendingUp,
  Upload,
  Sparkles,
  Compass,
  Camera,
  Clock,
  Calendar,
  User,
  Lock,
} from 'lucide-react';

import { imageApi } from '@/lib/api';
import { getApiUrl } from '@/lib/config';
import { sanitizeText } from '@/lib/sanitize';
import { getCountryName } from '@/lib/countries';
import { Card, Tag } from '@/components/design-system';

// Define WaveLoader before dynamic imports that reference it
const WaveLoader = () => (
  <div className="rounded-3xl bg-deep-900/40 p-6 backdrop-blur">
    <div className="wave-loader" aria-hidden="true" />
    <p className="mt-4 text-center text-sm text-surface-soft/70">
      Calibrating tides & telemetry…
    </p>
  </div>
);

const InteractiveHeroMap = nextDynamic(() => import('@/components/InteractiveHeroMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full rounded-3xl bg-gradient-to-r from-deep-900/40 to-pacific-900/30" />,
});

const SmartSearch = nextDynamic(() => import('@/components/SmartSearch'), {
  ssr: false,
  loading: () => null,
});

const FeaturedStories = nextDynamic(() => import('@/components/FeaturedStories'), {
  ssr: false,
  loading: () => null,
});

const SocialProof = nextDynamic(() => import('@/components/SocialProof'), {
  ssr: false,
  loading: () => null,
});

const GamificationBadges = nextDynamic(() => import('@/components/GamificationBadges'), {
  ssr: false,
  loading: () => null,
});

const VideoExplainer = nextDynamic(() => import('@/components/VideoExplainer'), {
  ssr: false,
  loading: () => null,
});

const MobileBottomNav = nextDynamic(() => import('@/components/MobileBottomNav'), {
  ssr: false,
  loading: () => null,
});

const PullToRefresh = nextDynamic(() => import('@/components/PullToRefresh'), {
  ssr: false,
  loading: () => null,
});

const HazardDistributionPie = nextDynamic(() => import('@/components/charts/HazardDistributionPie'), {
  ssr: false,
  loading: () => <WaveLoader />,
});

const TimelineTrendArea = nextDynamic(() => import('@/components/charts/TimelineTrendArea'), {
  ssr: false,
  loading: () => <WaveLoader />,
});

const ImpactMetricsBar = nextDynamic(() => import('@/components/charts/ImpactMetricsBar'), {
  ssr: false,
  loading: () => <WaveLoader />,
});

// Configuration constants
const RECENT_LIMIT = 60; // Fetch last 60 images for dashboard stats and gallery
const SPARKLINE_COLORS = ['#009ee0', '#ff6b4a', '#18b374']; // Pacific, Coral, Palm theme colors
const ACTIVITY_POLL_INTERVAL = 30000; // 30 seconds - balance between freshness and server load
export const dynamic = 'force-dynamic';

type SearchResponse = Awaited<ReturnType<typeof imageApi.search>>;
type ImageRecord = SearchResponse['images'][number];

const navigationCards = [
  {
    href: '/search',
    title: 'Search & Browse',
    description: 'Precision filters for hazard type, metadata fields, and timeframes.',
    icon: Search,
    accent: 'from-pacific-500/20 to-pacific-500/5',
    cta: 'Explore Catalog',
    ctaIcon: Filter,
  },
  {
    href: '/map',
    title: 'Interactive Map',
    description: 'Discover geolocated imagery with EEZ filters and spatial tools.',
    icon: MapPin,
    accent: 'from-palm-500/20 to-palm-500/5',
    cta: 'View Map',
    ctaIcon: Compass,
  },
  {
    href: '/analytics',
    title: 'Insights & Trends',
    description: 'Review hazard frequency, response velocity, and reviewer capacity.',
    icon: TrendingUp,
    accent: 'from-coral-500/20 to-coral-500/5',
    cta: 'Open Insights',
    ctaIcon: Sparkles,
  },
  {
    href: '/profile',
    title: 'User Profile',
    description: 'Track your uploads, achievements, and contribution statistics.',
    icon: User,
    accent: 'from-pacific-500/20 to-pacific-500/5',
    cta: 'View Profile',
    ctaIcon: User,
  },
];

function useCountUp(target: number, enabled: boolean, duration = 1400) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setDisplayValue(target);
      return;
    }

    let frame: number;
    let start: number | null = null;
    const startValue = 0;

    const animate = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(startValue + (target - startValue) * eased));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [target, enabled, duration]);

  return displayValue;
}

const AnimatedNumber = ({
  value,
  enabled,
  suffix = '',
  className,
}: {
  value: number;
  enabled: boolean;
  suffix?: string;
  className?: string;
}) => {
  const animated = useCountUp(value, enabled);
  return (
    <span className={className}>
      {animated.toLocaleString()}
      {suffix && <span className="text-white/70">{suffix}</span>}
    </span>
  );
};

const WaveBackdrop = () => (
  <svg
    className="pointer-events-none absolute bottom-0 left-0 right-0 h-40 text-white/30"
    viewBox="0 0 1440 320"
    aria-hidden="true"
  >
    <path
      fill="currentColor"
      fillOpacity="0.25"
      d="M0,288L48,272C96,256,192,224,288,176C384,128,480,64,576,37.3C672,11,768,21,864,48C960,75,1056,117,1152,122.7C1248,128,1344,96,1392,80L1440,64L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
    />
    <path
      fill="currentColor"
      fillOpacity="0.15"
      className="animate-wave-sway"
      d="M0,224L80,218.7C160,213,320,203,480,213.3C640,224,800,256,960,261.3C1120,267,1280,245,1360,234.7L1440,224L1440,320L1360,320C1280,320,1120,320,960,320C800,320,640,320,480,320C320,320,160,320,80,320L0,320Z"
    />
  </svg>
);

const Sparkline = ({ values, color }: { values: number[]; color: string }) => {
  if (values.length < 2) {
    return null;
  }
  
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  
  // Generate smooth curve path using quadratic bezier curves
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 100 - ((value - min) / range) * 80 - 10; // Add padding
    return { x, y };
  });
  
  // Create smooth path
  let pathData = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const controlX = (prev.x + curr.x) / 2;
    pathData += ` Q ${controlX} ${prev.y}, ${curr.x} ${curr.y}`;
  }
  
  // Create area fill path
  const areaPath = `${pathData} L 100 100 L 0 100 Z`;

  return (
    <svg 
      viewBox="0 0 100 100" 
      className="h-16 w-full" 
      preserveAspectRatio="none" 
      aria-hidden="true"
    >
      {/* Gradient definition */}
      <defs>
        <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      
      {/* Area fill */}
      <path
        d={areaPath}
        fill={`url(#gradient-${color})`}
        className="transition-all duration-500"
      />
      
      {/* Main line */}
      <path
        d={pathData}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="drop-shadow-[0_2px_6px_rgba(0,0,0,0.3)] transition-all duration-500"
      />
      
      {/* End point indicator */}
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="2.5"
        fill={color}
        className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]"
      />
    </svg>
  );
};

const HeroStatCard = ({
  label,
  value,
  suffix,
  loading,
}: {
  label: string;
  value: number;
  suffix?: string;
  loading: boolean;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 15 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    className="card-ripple rounded-3xl border border-white/10 bg-white/10 p-4 text-white backdrop-blur"
  >
    <p className="text-sm uppercase tracking-wide text-white/70">{label}</p>
    <AnimatedNumber value={value} enabled={!loading} suffix={suffix} className="mt-2 block text-3xl font-semibold" />
  </motion.div>
);

const MetricCard = ({
  label,
  value,
  suffix,
  icon: Icon,
  accent,
  loading,
  sparkline,
  sparkColor,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon: ComponentType<{ className?: string }>;
  accent: string;
  loading: boolean;
  sparkline?: number[];
  sparkColor?: string;
}) => {
  const hasSparkline = sparkline && sparkline.length >= 2;
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${accent} backdrop-blur-xl shadow-lg hover:shadow-2xl hover:border-white/20 transition-all duration-300`}
    >
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <div className="relative p-6">
        {/* Header with icon */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-1">
              {label}
            </p>
            <div className="flex items-baseline gap-1">
              <AnimatedNumber
                value={value}
                enabled={!loading}
                suffix={suffix}
                className="text-4xl font-bold text-white tabular-nums"
              />
            </div>
          </div>
          
          {/* Icon with animated background */}
          <div className="relative">
            <div className="absolute inset-0 bg-white/20 blur-xl rounded-full group-hover:bg-white/30 transition-all duration-300" />
            <div className="relative flex items-center justify-center h-12 w-12 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 group-hover:scale-110 group-hover:bg-white/20 transition-all duration-300">
              <Icon className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>
        
        {/* Sparkline area */}
        {hasSparkline ? (
          <div className="mt-4 -mb-2 -mx-2">
            <Sparkline values={sparkline} color={sparkColor ?? SPARKLINE_COLORS[0]} />
          </div>
        ) : (
          <div className="mt-2">
            <div className="h-12 flex items-center">
              <div className="text-xs text-white/40 italic">No trend data</div>
            </div>
          </div>
        )}
      </div>
      
      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </motion.div>
  );
};

const SparklineCard = ({
  series,
  loading,
}: {
  series: { label: string; total: number; values: number[]; color: string };
  loading: boolean;
}) => (
  <Card padding="lg" className="card-ripple bg-deep-950/60">
    <div className="flex items-center justify-between">
      <p className="text-sm uppercase tracking-wide text-white/60">{series.label}</p>
      <span className="text-xs text-white/60">Sparkline</span>
    </div>
    <AnimatedNumber
      value={series.total}
      enabled={!loading}
      suffix=" reports"
      className="mt-2 block text-3xl font-semibold"
    />
    <Sparkline values={series.values} color={series.color} />
  </Card>
);

const buildImageUrl = (path?: string | null) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return getApiUrl(path);
};

const resolveImagePath = (image: ImageRecord) => {
  const directUrl = (image as { image_url?: string | null }).image_url;
  return image.thumbnail_url || directUrl;
};

const resolveCountry = (image: ImageRecord) => {
  const code = (image as { country?: string }).country;
  return code ? getCountryName(code) : undefined;
};
const resolveDescription = (image: ImageRecord) =>
  (image as { description?: string }).description ?? (image as { abstract?: string }).abstract;

export default function PacificImpactAtlasDashboard() {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-images'],
    queryFn: () =>
      imageApi.search({ limit: RECENT_LIMIT, sort_by: 'upload_date', sort_order: 'desc' }),
    staleTime: 1000 * 60 * 5,
  });

  const images = data?.images ?? [];

  // Handle pull-to-refresh
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dashboard-images'] }),
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] }),
      queryClient.invalidateQueries({ queryKey: ['contributor-stats'] }),
    ]);
  }, [queryClient]);

  const stats = useMemo(() => {
    const hazardSet = new Set(images.map((img) => img.hazard_type).filter(Boolean));
    const orgSet = new Set(images.map((img) => img.contact?.organisation_name).filter(Boolean));
    // Fix: Use explicit null/undefined checks to support equator (lat=0) and prime meridian (lon=0)
    const withCoordinates = images.filter((img) => 
      img.latitude !== null && img.latitude !== undefined && 
      img.longitude !== null && img.longitude !== undefined
    ).length;
    
    // Prepare hazard distribution data for pie chart
    const hazardCounts = new Map<string, number>();
    images.forEach((img) => {
      const hazard = img.hazard_type || 'Unknown';
      hazardCounts.set(hazard, (hazardCounts.get(hazard) || 0) + 1);
    });
    const hazardDistribution = Array.from(hazardCounts.entries()).map(([hazard_type, count]) => ({
      hazard_type,
      count,
    }));
    
    // Prepare timeline data for area chart - Always generate 30 daily buckets
    const timelineCounts = new Map<string, number>();
    images.forEach((img) => {
      if (img.upload_date) {
        const date = new Date(img.upload_date).toISOString().split('T')[0];
        timelineCounts.set(date, (timelineCounts.get(date) || 0) + 1);
      }
    });
    
    // Generate full 30-day window with zeros for missing days
    const today = new Date();
    const timeline = Array.from({ length: 30 }, (_, i) => {
      const date = new Date(today);
      date.setDate(date.getDate() - (29 - i)); // 29 days ago to today
      const dateStr = date.toISOString().split('T')[0];
      return {
        date: dateStr,
        count: timelineCounts.get(dateStr) || 0,
      };
    });
    
    // Prepare impact metrics for bar chart
    const countryCounts = new Map<string, number>();
    images.forEach((img) => {
      const country = resolveCountry(img) || 'Unspecified location';
      countryCounts.set(country, (countryCounts.get(country) || 0) + 1);
    });
    const totalCountries = countryCounts.size;
    const impactMetrics = Array.from(countryCounts.entries())
      .map(([name, value]) => ({ 
        name, 
        value,
        country: name // Keep original for logic
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    
    // Fix: Calculate actual 30-day uploads by summing the timeline counts
    const recentUploads = timeline.reduce((sum, day) => sum + day.count, 0);
    
    return {
      total: data?.total ?? images.length ?? 0,
      hazardTypes: hazardSet.size,
      organizations: orgSet.size,
      withCoordinates,
      recentUploads,
      hazardDistribution,
      timeline,
      impactMetrics,
      totalCountries,
    };
  }, [data, images]);

  const sparklineSeries = useMemo(() => {
    const counts = new Map<string, number>();
    images.forEach((img) => {
      const key = img.hazard_type || 'Unknown';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label, value], index) => {
        const values = Array.from({ length: 12 }, (_, i) => {
          const drift = Math.sin((i + 1) / 2) * (value * 0.2);
          return Math.max(1, value * 0.6 + drift + i * 1.5);
        });
        return {
          label,
          total: value,
          color: SPARKLINE_COLORS[index % SPARKLINE_COLORS.length],
          values,
        };
      });
  }, [images]);

  const heroStats = [
    { label: 'Pacific Hazards Curated', value: stats.total, suffix: '+' },
    { label: 'Reviewed in 30 days', value: stats.recentUploads, suffix: '' },
  ];

  // Fetch featured stories from API
  const { data: featuredStoriesData } = useQuery({
    queryKey: ['featured-stories'],
    queryFn: imageApi.getFeaturedStories,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    meta: {
      errorMessage: 'Featured stories endpoint optional - using fallback',
    },
  });

  // Prepare featured stories data - use API data only, no hardcoded fallbacks with non-existent images
  const featuredStories = useMemo(() => {
    if (featuredStoriesData && Array.isArray(featuredStoriesData) && featuredStoriesData.length > 0) {
      // Map API response to FeaturedStories component format
      return featuredStoriesData.map((story: any) => ({
        id: story.id.toString(),
        title: story.title,
        description: story.description,
        beforeImage: story.beforeImage || story.image,
        afterImage: story.afterImage || story.image,
        location: story.location,
        date: story.date,
        hazardType: story.hazard_type,
        impact: story.impact || `${story.country || ''}`,
      }));
    }

    // Return empty array - FeaturedStories component will handle empty state gracefully
    return [];
  }, [featuredStoriesData]);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="min-h-screen bg-gradient-to-b from-deep-950 via-deep-900 to-deep-950 pb-24 text-white">
      {/* Header with Interactive Map Hero */}
      <header className="relative isolate overflow-hidden">
        <InteractiveHeroMap images={images} />
        <div className="relative z-10 max-w-7xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mt-6 max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl"
              >
                Pacific Disaster Evidence Repository
              </motion.h1>
              <p className="mt-6 max-w-2xl text-lg text-white/80">
                A centralized database of verified disaster impact imagery across Pacific island nations. Upload field observations, search historical events, and access geospatial evidence for cyclones, tsunamis, floods, and volcanic activity.
              </p>
            </div>
            <SmartSearch />
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/search"
              className="group inline-flex items-center gap-2 rounded-full bg-coral-500 px-6 py-3 font-semibold text-white shadow-lg shadow-coral-500/30 transition hover:bg-coral-400 hover:shadow-xl hover:shadow-coral-500/40"
            >
              <Search className="h-5 w-5 transition-transform group-hover:-translate-y-0.5" />
              Launch Search
            </Link>
            {isAuthenticated ? (
              <Link
                id="upload-button"
                href="/upload"
                className="inline-flex items-center gap-2 rounded-full bg-palm-600 px-6 py-3 font-semibold text-white shadow-lg shadow-palm-600/30 transition hover:bg-palm-500 hover:shadow-xl hover:shadow-palm-500/40"
              >
                <Upload className="h-5 w-5" />
                Upload Field Sighting
              </Link>
            ) : (
              <Link
                id="upload-button"
                href="/auth/login?returnUrl=%2Fupload"
                className="inline-flex items-center gap-2 rounded-full bg-palm-600 px-6 py-3 font-semibold text-white shadow-lg shadow-palm-600/30 transition hover:bg-palm-500 hover:shadow-xl hover:shadow-palm-500/40 relative"
                title="Login required to upload"
              >
                <Lock className="h-4 w-4" />
                <Upload className="h-5 w-5" />
                Upload Field Sighting
              </Link>
            )}
            {isAuthenticated ? (
              <Link
                id="analytics-link"
                href="/profile"
                className="inline-flex items-center gap-2 rounded-full bg-pacific-600 px-6 py-3 font-semibold text-white shadow-lg shadow-pacific-600/30 transition hover:bg-pacific-500 hover:shadow-xl hover:shadow-pacific-500/40"
              >
                <User className="h-5 w-5" />
                Profile
              </Link>
            ) : (
              <Link
                href="/auth/login?returnUrl=%2Fprofile"
                className="inline-flex items-center gap-2 rounded-full bg-pacific-600 px-6 py-3 font-semibold text-white shadow-lg shadow-pacific-600/30 transition hover:bg-pacific-500 hover:shadow-xl hover:shadow-pacific-500/40"
                title="Login required to view profile"
              >
                <Lock className="h-4 w-4" />
                <User className="h-5 w-5" />
                Profile
              </Link>
            )}
            <Link
              href="https://github.com/kishkumar96/impact-database"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border-2 border-white/30 backdrop-blur-sm bg-white/10 px-6 py-3 font-semibold text-white transition hover:bg-white/20 hover:border-white/50"
            >
              <Sparkles className="h-5 w-5" />
              View Documentation
            </Link>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {heroStats.map((stat) => (
              <HeroStatCard key={stat.label} label={stat.label} value={stat.value} suffix={stat.suffix} loading={isLoading} />
            ))}
          </div>
        </div>
        <WaveBackdrop />
      </header>

      <main className="relative z-10 -mt-16 space-y-12 px-4 pb-10 sm:px-6 lg:px-8">
        {/* Analytics Dashboard - Rapid Situational Snapshot */}
        <section className="mx-auto max-w-7xl">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-deep-900/40 to-pacific-900/30 backdrop-blur">
            {/* Section Header */}
            <div className="border-b border-white/10 px-6 py-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium uppercase tracking-wide text-pacific-400">
                    Data Insights
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-white">
                    Pacific Impact Evidence Dashboard
                  </h2>
                  <p className="mt-2 text-sm text-surface-soft">
                    Summarises recent disaster impact evidence submitted across the Pacific region.
                  </p>
                </div>
                <div className="flex flex-col items-start gap-1 text-xs text-surface-soft sm:items-end sm:text-right">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Last updated: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Coverage: last 30 days</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Insight Summary Row */}
            {!isLoading && stats.hazardDistribution.length > 0 && (
              <div className="border-b border-white/10 bg-deep-950/40 px-6 py-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-sm">
                  {/* Dominant Hazard Insight */}
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <div className="h-2 w-2 rounded-full bg-pacific-400 animate-pulse" />
                    </div>
                    <div>
                      <p className="font-medium text-white">
                        {stats.hazardDistribution[0]?.hazard_type?.replace(/_/g, ' ').toUpperCase() || 'Unknown'} most documented
                      </p>
                      <p className="text-xs text-surface-soft">
                        {stats.hazardDistribution[0]?.count || 0} of {stats.total} images ({stats.total > 0 ? Math.round((stats.hazardDistribution[0]?.count || 0) / stats.total * 100) : 0}%)
                      </p>
                    </div>
                  </div>

                  {/* Timeline Insight */}
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <div className="h-2 w-2 rounded-full bg-palm-400 animate-pulse" />
                    </div>
                    <div>
                      <p className="font-medium text-white">
                        {stats.timeline.filter((d: any) => d.count > 0).length} active days
                      </p>
                      <p className="text-xs text-surface-soft">
                        {stats.timeline.length > 0 && stats.timeline[stats.timeline.length - 1]?.count > 0 
                          ? `${stats.timeline[stats.timeline.length - 1].count} uploads today`
                          : 'No uploads in last 24h'}
                      </p>
                    </div>
                  </div>

                  {/* Country Insight */}
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <div className="h-2 w-2 rounded-full bg-coral-400 animate-pulse" />
                    </div>
                    <div>
                      <p className="font-medium text-white">
                        {stats.totalCountries || 0} countries affected
                      </p>
                      <p className="text-xs text-surface-soft">
                        {stats.impactMetrics[0]?.name || 'N/A'} leads with {stats.impactMetrics[0]?.value || 0} images
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Empty State - Never looks broken */}
            {!isLoading && stats.total === 0 && (
              <div className="px-6 py-12 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-pacific-500/20">
                  <Camera className="h-8 w-8 text-pacific-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  No Evidence Documented Yet
                </h3>
                <p className="text-sm text-surface-soft max-w-md mx-auto mb-6">
                  Analytics will appear here once disaster impact images are uploaded to the system.
                  Be the first to contribute critical evidence.
                </p>
                <Link
                  href="/upload"
                  className="inline-flex items-center gap-2 rounded-lg bg-pacific-600 px-4 py-2 text-sm font-medium text-white hover:bg-pacific-700 transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  Upload First Image
                </Link>
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <div className="px-6 py-12">
                <WaveLoader />
              </div>
            )}

            {/* Charts Grid - Only show when data exists */}
            {!isLoading && stats.total > 0 && (
              <div className="p-6 space-y-6">
                {/* Top Row: Hazard Distribution + Upload Timeline */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Hazard Distribution - Left Column */}
                  <div className="rounded-2xl border border-white/10 bg-deep-950/60 backdrop-blur p-6 min-h-[400px]">
                    <div className="mb-4">
                      <h3 className="text-base font-semibold text-white">Hazard Distribution</h3>
                      <p className="text-xs text-surface-soft mt-1">
                        Type breakdown of {stats.total} documented incidents
                      </p>
                    </div>
                    <HazardDistributionPie data={stats.hazardDistribution} />
                    <p className="mt-4 text-xs text-surface-soft border-t border-white/5 pt-3">
                      💡 <strong>{stats.hazardDistribution.length} hazard types</strong> recorded. 
                      {stats.hazardDistribution[0] && ` ${stats.hazardDistribution[0].hazard_type.replace(/_/g, ' ')} accounts for ${Math.round((stats.hazardDistribution[0].count / stats.total) * 100)}% of evidence.`}
                    </p>
                  </div>

                  {/* Upload Timeline - Right 2 Columns */}
                  <div className="rounded-2xl border border-white/10 bg-deep-950/60 backdrop-blur p-6 lg:col-span-2 min-h-[400px]">
                    <div className="mb-4">
                      <h3 className="text-base font-semibold text-white">Upload Timeline</h3>
                      <p className="text-xs text-surface-soft mt-1">
                        Evidence submission trend over last 30 days
                      </p>
                    </div>
                    <TimelineTrendArea data={stats.timeline} />
                  </div>
                </div>

                {/* Bottom Row: Impact by Country - Full Width */}
                <div className="rounded-2xl border border-white/10 bg-deep-950/60 backdrop-blur p-6 min-h-[400px]">
                  <div className="mb-4">
                    <h3 className="text-base font-semibold text-white">Impact by Country</h3>
                    <p className="text-xs text-surface-soft mt-1">
                      Top 10 countries by documented evidence (total: {stats.totalCountries || 0} countries)
                    </p>
                  </div>
                  <ImpactMetricsBar data={stats.impactMetrics} />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Metrics Section */}
        <section className="mx-auto grid max-w-7xl gap-6 rounded-3xl bg-deep-900/40 p-6 backdrop-blur">
          {isLoading ? (
            <WaveLoader />
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Catalogued Images"
                value={stats.total}
                suffix="+"
                icon={Camera}
                accent="from-pacific-500/20 to-pacific-500/5"
                loading={isLoading}
                sparkline={sparklineSeries[0]?.values ?? undefined}
                sparkColor={sparklineSeries[0]?.color ?? SPARKLINE_COLORS[0]}
              />
              <MetricCard
                label="Hazard Archetypes"
                value={stats.hazardTypes}
                icon={Compass}
                accent="from-palm-500/20 to-palm-500/5"
                loading={isLoading}
                sparkline={sparklineSeries[1]?.values ?? undefined}
                sparkColor={sparklineSeries[1]?.color ?? SPARKLINE_COLORS[1]}
              />
              <MetricCard
                label="Active Contributors"
                value={stats.organizations}
                icon={Globe}
                accent="from-coral-500/20 to-coral-500/5"
                loading={isLoading}
                sparkline={sparklineSeries[2]?.values ?? undefined}
                sparkColor={sparklineSeries[2]?.color ?? SPARKLINE_COLORS[2]}
              />
              <MetricCard
                label="With Coordinates"
                value={stats.withCoordinates}
                icon={MapPin}
                accent="from-sand-500/20 to-sand-500/5"
                loading={isLoading}
              />
            </div>
          )}
        </section>

        {/* Featured Stories Section */}
        <FeaturedStories stories={featuredStories} />

        <section className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3">
          {navigationCards.map((card, index) => (
            <motion.div
              key={card.href}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
              viewport={{ once: true }}
            >
              <Link
                href={card.href}
                className="block h-full rounded-3xl border border-white/10 bg-gradient-to-br p-6 text-white transition hover:bg-white/5"
              >
                <div className={`inline-flex rounded-2xl bg-gradient-to-br ${card.accent} p-3`}>
                  <card.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-xl font-semibold">{card.title}</h3>
                <p className="mt-2 text-sm text-white/70">{card.description}</p>
                <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-white">
                  {card.cta}
                  <card.ctaIcon className="h-4 w-4" />
                </div>
              </Link>
            </motion.div>
          ))}
        </section>

        <section className="mx-auto max-w-7xl rounded-3xl border border-white/10 bg-gradient-to-br from-deep-900/40 to-pacific-900/20 p-6 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-sm uppercase tracking-wide text-pacific-400">Recent Activity</p>
              <h2 className="text-2xl font-semibold text-white">Latest Evidence Submissions</h2>
            </div>
            <Tag className="bg-palm-500/20 text-palm-200">
              Live updates
            </Tag>
          </div>
          
          {isLoading ? (
            <div className="mt-8">
              <WaveLoader />
            </div>
          ) : images.length === 0 ? (
            <div className="mt-8 text-center py-12 rounded-xl border border-white/10 bg-deep-950/40">
              <Camera className="mx-auto h-12 w-12 text-white/30 mb-4" />
              <p className="text-white/60 mb-2">No evidence documented yet</p>
              <p className="text-sm text-white/40">Upload disaster impact images to start tracking</p>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {images.slice(0, 5).map((image, index) => {
                const imageUrl = buildImageUrl(resolveImagePath(image));
                const uploadTime = image.upload_date ? new Date(image.upload_date) : null;
                const timeAgo = uploadTime ? (
                  Math.floor((Date.now() - uploadTime.getTime()) / (1000 * 60 * 60)) < 24
                    ? `${Math.floor((Date.now() - uploadTime.getTime()) / (1000 * 60 * 60))}h ago`
                    : uploadTime.toLocaleDateString()
                ) : 'Recently';
                
                return (
                  <motion.div
                    key={image.filename}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-deep-950/40 hover:bg-deep-950/60 hover:border-white/20 transition-all group"
                  >
                    {/* Thumbnail */}
                    <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-deep-900">
                      {imageUrl ? (
                        <NextImage
                          src={imageUrl}
                          alt={sanitizeText(image.title || image.filename)}
                          fill
                          sizes="80px"
                          className="object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Camera className="w-8 h-8 text-white/20" />
                        </div>
                      )}
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-white truncate group-hover:text-pacific-300 transition-colors">
                            {sanitizeText(image.title || image.filename)}
                          </h3>
                          <div className="flex items-center gap-3 mt-1 text-sm text-white/60">
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" />
                              <span className="truncate">{sanitizeText(resolveCountry(image)) || 'Unknown location'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              <span>{timeAgo}</span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Hazard badge */}
                        <span className="flex-shrink-0 px-2.5 py-1 text-xs font-medium bg-pacific-600/80 text-white rounded-full capitalize">
                          {image.hazard_type || 'hazard'}
                        </span>
                      </div>
                    </div>
                    
                    {/* View arrow */}
                    <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <TrendingUp className="w-5 h-5 text-pacific-400" />
                    </div>
                  </motion.div>
                );
              })}
              
              {/* View all link - Fix: Use actual repository total instead of page size */}
              {images.length > 5 && (
                <Link
                  href="/search"
                  className="block mt-4 text-center py-3 rounded-lg border border-white/10 text-sm text-pacific-400 hover:bg-white/5 hover:border-pacific-500/50 transition-all"
                >
                  View all {(data?.total ?? images.length).toLocaleString()} evidence submissions →
                </Link>
              )}
            </div>
          )}
        </section>

        {/* Week 3: Social Proof Section */}
        <SocialProof />

        {/* Week 3: Video Explainer */}
        <VideoExplainer />

        {/* Week 3: Gamification Badges */}
        <GamificationBadges />
      </main>

      {/* Week 3: Mobile Bottom Navigation */}
      <MobileBottomNav />
      </div>
    </PullToRefresh>
  );
}

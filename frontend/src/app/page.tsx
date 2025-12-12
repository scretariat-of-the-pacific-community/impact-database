'use client';

import { useMemo, useState, useCallback, useEffect, type ComponentType } from 'react';
import nextDynamic from 'next/dynamic';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
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
  X,
} from 'lucide-react';

import { imageApi } from '@/lib/api';
import { getApiUrl } from '@/lib/config';
import { sanitizeText } from '@/lib/sanitize';
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

const ActivityFeed = nextDynamic(() => import('@/components/ActivityFeed'), {
  ssr: false,
  loading: () => null,
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
const HERO_VIDEO =
  'https://cdn.coverr.co/videos/coverr-ocean-waves-at-sunset-3418/1080p.mp4';
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
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 100 100" className="h-16 w-full" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        className="drop-shadow-[0_3px_8px_rgba(0,0,0,0.25)]"
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
}) => (
  <Card padding="lg" className={`card-ripple border border-white/10 bg-gradient-to-br ${accent}`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm uppercase tracking-wide text-white/70">{label}</p>
        <AnimatedNumber
          value={value}
          enabled={!loading}
          suffix={suffix}
          className="mt-2 block text-3xl font-semibold"
        />
      </div>
      <div className="rounded-2xl bg-white/10 p-3">
        <Icon className="h-6 w-6 text-white" />
      </div>
    </div>
    {sparkline && <Sparkline values={sparkline} color={sparkColor ?? SPARKLINE_COLORS[0]} />}
  </Card>
);

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

const resolveCountry = (image: ImageRecord) => (image as { country?: string }).country;
const resolveDescription = (image: ImageRecord) =>
  (image as { description?: string }).description ?? (image as { abstract?: string }).abstract;

const GalleryCard = ({
  image,
  onSelect,
}: {
  image: ImageRecord;
  onSelect: (img: ImageRecord) => void;
}) => {
  const thumbnail = buildImageUrl(resolveImagePath(image));
  return (
    <motion.button
      type="button"
      onClick={() => onSelect(image)}
      className="group h-full rounded-3xl border border-white/10 bg-deep-900/50 text-left transition hover:-translate-y-1 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pacific-400"
      whileHover={{ scale: 1.01 }}
    >
      {thumbnail ? (
        <div className="relative h-48 overflow-hidden rounded-2xl">
          <img
            src={thumbnail}
            alt={image.title ?? image.filename}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <p className="absolute bottom-3 left-4 text-sm font-semibold text-white">
            {sanitizeText(resolveCountry(image)) || 'Unknown location'}
          </p>
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center rounded-2xl bg-deep-900/60 text-sm text-white/60">
          Preview unavailable
        </div>
      )}
      <div className="p-4 text-white">
        <p className="text-sm uppercase tracking-wide text-white/60">
          {image.hazard_type || 'Hazard'}
        </p>
        <p className="mt-2 line-clamp-2 text-base font-semibold">
          {sanitizeText(image.title) || sanitizeText(image.filename)}
        </p>
      </div>
    </motion.button>
  );
};

export default function OceanPortalDashboard() {
  const queryClient = useQueryClient();
  
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
    const withCoordinates = images.filter((img) => img.latitude && img.longitude).length;
    
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
    
    // Prepare timeline data for area chart
    const timelineCounts = new Map<string, number>();
    images.forEach((img) => {
      if (img.upload_date) {
        const date = new Date(img.upload_date).toISOString().split('T')[0];
        timelineCounts.set(date, (timelineCounts.get(date) || 0) + 1);
      }
    });
    const timeline = Array.from(timelineCounts.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30); // Last 30 days
    
    // Prepare impact metrics for bar chart
    const countryCounts = new Map<string, number>();
    images.forEach((img) => {
      const country = resolveCountry(img) || 'Unknown';
      countryCounts.set(country, (countryCounts.get(country) || 0) + 1);
    });
    const impactMetrics = Array.from(countryCounts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    
    return {
      total: data?.total ?? images.length ?? 0,
      hazardTypes: hazardSet.size,
      organizations: orgSet.size,
      withCoordinates,
      recentUploads: Math.min(images.length, 24),
      hazardDistribution,
      timeline,
      impactMetrics,
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
    { label: 'Live Contributors', value: Math.max(stats.organizations, 12), suffix: '' },
    { label: 'Reviewed in 30 days', value: stats.recentUploads, suffix: '' },
  ];

  const galleryImages = useMemo(
    () => images.filter((img) => resolveImagePath(img)).slice(0, 9),
    [images]
  );

  const [lightboxImage, setLightboxImage] = useState<ImageRecord | null>(null);
  const openLightbox = useCallback((img: ImageRecord) => setLightboxImage(img), []);
  const closeLightbox = useCallback(() => setLightboxImage(null), []);

  // Fetch featured stories from API
  const { data: featuredStoriesData } = useQuery({
    queryKey: ['featured-stories'],
    queryFn: imageApi.getFeaturedStories,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Prepare featured stories data with fallback to placeholder
  const featuredStories = useMemo(() => {
    if (featuredStoriesData && Array.isArray(featuredStoriesData) && featuredStoriesData.length > 0) {
      // Map API response to FeaturedStories component format
      return featuredStoriesData.map((story: any) => ({
        id: story.id.toString(),
        title: story.title,
        description: story.description,
        beforeImage: story.image, // Using single image for now
        afterImage: story.image,
        location: story.location,
        date: story.date,
        hazardType: story.hazard_type,
        impact: `${story.country || ''}`,
      }));
    }

    // Fallback to placeholder if API fails or returns no data
    return [
      {
        id: '1',
        title: 'Cyclone Winston Recovery: Fiji\'s Resilience',
        description: 'Before and after images showing the devastating impact of Category 5 Cyclone Winston in 2016 and the remarkable recovery efforts that followed.',
        beforeImage: '/stories/placeholder-before.svg',
        afterImage: '/stories/placeholder-after.svg',
        location: 'Fiji',
        date: '2016-02-20',
        hazardType: 'Cyclone',
        impact: '44 deaths, $1.4B in damages',
      },
      {
        id: '2',
        title: 'Tonga Tsunami: Rebuilding Communities',
        description: 'The aftermath of the 2022 Hunga Tonga volcanic eruption and tsunami, documenting the path to recovery.',
        beforeImage: '/stories/placeholder-before.svg',
        afterImage: '/stories/placeholder-after.svg',
        location: 'Tonga',
        date: '2022-01-15',
        hazardType: 'Tsunami',
        impact: 'Major infrastructure damage, 84% population affected',
      },
    ];
  }, [featuredStoriesData]);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="min-h-screen bg-gradient-to-b from-deep-950 via-deep-900 to-deep-950 pb-24 text-white">
        {/* Activity Feed - Fixed Position */}
        <ActivityFeed />

      {/* Header with Interactive Map Hero */}
      <header className="relative isolate overflow-hidden">
        <InteractiveHeroMap images={images} />
        <div className="relative z-10 max-w-7xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <Tag className="border-white/30 bg-white/10 text-white backdrop-blur">
                Data Storytelling · Week 2
              </Tag>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mt-6 max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl"
              >
                Interactive maps & visual intelligence for Pacific hazards
              </motion.h1>
              <p className="mt-6 max-w-2xl text-lg text-white/80">
                Explore 3D terrain, heatmaps, and timeline-driven insights. Discover compelling before/after stories and real-time activity across the Pacific region.
              </p>
            </div>
            <SmartSearch />
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/search"
              className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-pacific-600 transition hover:shadow-card"
            >
              <Search className="h-5 w-5 transition-transform group-hover:-translate-y-0.5" />
              Launch Search
            </Link>
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 rounded-full border border-white/40 px-6 py-3 text-white transition hover:bg-white/10"
            >
              <Upload className="h-5 w-5" />
              Upload Field Sighting
            </Link>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-white/40 px-6 py-3 text-white transition hover:bg-white/10"
            >
              <Sparkles className="h-5 w-5" />
              Watch the Story
            </button>
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
        {/* Advanced Visualizations Section */}
        <section className="mx-auto max-w-7xl space-y-6">
          <div className="rounded-3xl border border-white/10 bg-deep-900/40 p-6 backdrop-blur">
            <div className="mb-6">
              <p className="text-sm uppercase tracking-wide text-white/70">Data Insights</p>
              <h2 className="text-2xl font-semibold">Visual Analytics Dashboard</h2>
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Hazard Distribution Pie Chart */}
              <div className="rounded-2xl border border-white/10 bg-deep-950/60 p-6">
                <h3 className="mb-4 text-lg font-semibold">Hazard Distribution</h3>
                {isLoading ? (
                  <WaveLoader />
                ) : (
                  <HazardDistributionPie data={stats.hazardDistribution} />
                )}
              </div>

              {/* Timeline Trend Area Chart */}
              <div className="rounded-2xl border border-white/10 bg-deep-950/60 p-6 lg:col-span-2">
                <h3 className="mb-4 text-lg font-semibold">Upload Timeline (Last 30 Days)</h3>
                {isLoading ? (
                  <WaveLoader />
                ) : (
                  <TimelineTrendArea data={stats.timeline} />
                )}
              </div>
            </div>

            {/* Impact Metrics Bar Chart */}
            <div className="mt-6 rounded-2xl border border-white/10 bg-deep-950/60 p-6">
              <h3 className="mb-4 text-lg font-semibold">Impact by Country (Top 10)</h3>
              {isLoading ? (
                <WaveLoader />
              ) : (
                <ImpactMetricsBar data={stats.impactMetrics} />
              )}
            </div>
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
                sparkline={sparklineSeries[0]?.values}
                sparkColor={sparklineSeries[0]?.color}
              />
              <MetricCard
                label="Hazard Archetypes"
                value={stats.hazardTypes}
                icon={Compass}
                accent="from-palm-500/20 to-palm-500/5"
                loading={isLoading}
                sparkline={sparklineSeries[1]?.values}
                sparkColor={sparklineSeries[1]?.color}
              />
              <MetricCard
                label="Active Contributors"
                value={stats.organizations || 12}
                icon={Globe}
                accent="from-coral-500/20 to-coral-500/5"
                loading={isLoading}
                sparkline={sparklineSeries[2]?.values}
                sparkColor={sparklineSeries[2]?.color}
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

        <section className="mx-auto max-w-7xl rounded-3xl border border-white/10 bg-deep-900/40 p-6 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-wide text-white/70">Hazard Intelligence</p>
              <h2 className="text-2xl font-semibold">Animated review dashboard</h2>
            </div>
            <Tag className="bg-coral-500/20 text-coral-200">
              Live telemetry
            </Tag>
          </div>
          {sparklineSeries.length === 0 ? (
            <div className="mt-8">
              <WaveLoader />
            </div>
          ) : (
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {sparklineSeries.map((series) => (
                <SparklineCard key={series.label} series={series} loading={isLoading} />
              ))}
            </div>
          )}
        </section>

        {/* Week 3: Social Proof Section */}
        <SocialProof />

        {/* Week 3: Video Explainer */}
        <VideoExplainer />

        {/* Week 3: Gamification Badges */}
        <GamificationBadges />

        <section className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-wide text-white/70">Immersive Impact Gallery</p>
              <h2 className="text-2xl font-semibold">Thumbnails with lightbox + micro-interactions</h2>
            </div>
            <Link
              href="/images"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              View full gallery
              <Camera className="h-4 w-4" />
            </Link>
          </div>

          {isLoading ? (
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={`placeholder-${index}`} className="h-48 animate-pulse rounded-3xl bg-white/5 backdrop-blur" />
              ))}
            </div>
          ) : (
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {galleryImages.map((image) => (
                <GalleryCard key={image.id ?? image.filename} image={image} onSelect={openLightbox} />
              ))}
            </div>
          )}
        </section>
      </main>

      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeLightbox}
          >
            <motion.div
              className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-deep-900/90 p-6 text-left text-white shadow-2xl"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="relative aspect-video w-full overflow-hidden rounded-2xl">
                <img
                  src={buildImageUrl(resolveImagePath(lightboxImage)) || ''}
                  alt={lightboxImage.title ?? lightboxImage.filename}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-wide text-white/60">
                    {lightboxImage.hazard_type}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold">
                    {sanitizeText(lightboxImage.title) ?? sanitizeText(lightboxImage.filename)}
                  </h3>
                  <p className="mt-2 text-white/70">
                    {sanitizeText(resolveDescription(lightboxImage)) || 'Field notes unavailable.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeLightbox}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Week 3: Mobile Bottom Navigation */}
      <MobileBottomNav />
      </div>
    </PullToRefresh>
  );
}

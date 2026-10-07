'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { MapPin, Image, Filter } from 'lucide-react';

import { imageApi } from '@/lib/api';
import { configureLeafletIcons } from '@/lib/leaflet-config';
import ErrorBoundary from '@/components/ErrorBoundary';
import ErrorBanner from '@/components/ErrorBanner';
import Skeleton from '@/components/design-system/Skeleton';
import { trackMapInteraction } from '@/lib/analytics';
import type { HazardType } from '@/lib/types';

const MapContainer = dynamic(
  () => import('react-leaflet').then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((m) => m.TileLayer),
  { ssr: false }
);
const Marker = dynamic(() => import('react-leaflet').then((m) => m.Marker), {
  ssr: false,
});
const Popup = dynamic(() => import('react-leaflet').then((m) => m.Popup), {
  ssr: false,
});
const MapUsageTracker = dynamic(
  () =>
    import('react-leaflet').then(({ useMapEvents }) => {
      return function Tracker() {
        useMapEvents({
          moveend: (event: any) => {
            const map = event.target;
            const center = map.getCenter();
            trackMapInteraction('move', {
              zoom: map.getZoom(),
              lat: Number(center.lat.toFixed(4)),
              lng: Number(center.lng.toFixed(4)),
            });
          },
        });
        return null;
      };
    }),
  { ssr: false }
);

export default function MapPage() {
  const [createCustomIcon, setCreateCustomIcon] = useState<any>(null);

  useEffect(() => {
    configureLeafletIcons();
    // Dynamically import mapUtils only on client-side
    import('@/lib/mapUtils').then((mod) => {
      setCreateCustomIcon(() => mod.createCustomIcon);
    });
  }, []);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['map-images'],
    queryFn: () => imageApi.search({ limit: 1000 }),
  });

  const images = (data as any)?.images || [];
  const imagesWithCoordinates = images.filter(
    (img: any) =>
      typeof img.latitude === 'number' && typeof img.longitude === 'number'
  );
  const errorMessage =
    error instanceof Error ? error.message : 'Unable to load map data';

  useEffect(() => {
    if (imagesWithCoordinates.length > 0) {
      trackMapInteraction('view_loaded', { zoom: 2 });
    }
  }, [imagesWithCoordinates.length]);

  const geocodedCount = imagesWithCoordinates.length;
  const missingCoordinates = Math.max(images.length - geocodedCount, 0);
  const hazardTypeCount = new Set(
    imagesWithCoordinates
      .map((img: any) => img.hazard_type)
      .filter((type: any): type is HazardType => Boolean(type))
  ).size;

  return (
    <ErrorBoundary boundaryName="map view">
      <div className="min-h-screen bg-gradient-to-b from-deep-950 via-deep-900 to-deep-950 px-4 py-8 text-white">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-white/60">
                Interactive Exploration
              </p>
              <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
                Map View
              </h1>
              <p className="mt-2 text-sm text-white/70">
                Locate geotagged hazards with the same glassmorphism styling as
                the home dashboard.
              </p>
            </div>
            <Link
              href="/"
              className="hidden rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition hover:-translate-y-0.5 hover:border-white/40 hover:text-white lg:inline-flex"
            >
              Back to home
            </Link>
          </div>

          {isLoading ? (
            <MapInsightsSkeleton />
          ) : (
            <MapInsights
              geocodedCount={geocodedCount}
              missingCoordinates={missingCoordinates}
              hazardTypeCount={hazardTypeCount}
            />
          )}

          <div className="flex h-[600px] items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-card backdrop-blur">
            {isLoading ? (
              <MapLoadingState />
            ) : error ? (
              <div className="w-full px-6">
                <ErrorBanner
                  title="Error loading map data"
                  message={errorMessage}
                  tone="error"
                  onRetry={() => refetch()}
                  retryLabel="Retry loading"
                />
              </div>
            ) : geocodedCount === 0 ? (
              <MapEmptyState onRetry={refetch} />
            ) : (
              <motion.div
                className="h-full w-full"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              >
                <MapContainer
                  center={[0, 0]}
                  zoom={2}
                  className="h-full w-full"
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution="&copy; OpenStreetMap contributors"
                  />
                  <MapUsageTracker />
                  {createCustomIcon &&
                    imagesWithCoordinates.map((image: any, index: any) => (
                      <Marker
                        key={image.id}
                        position={
                          [image.latitude!, image.longitude!] as [
                            number,
                            number,
                          ]
                        }
                        icon={createCustomIcon(image.hazard_type)}
                      >
                        <Popup>
                          <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.01 }}
                            className="text-sm space-y-1"
                          >
                            <Link
                              href={`/images/${image.id}`}
                              className="text-blue-600 hover:underline font-medium"
                            >
                              {image.title || image.filename}
                            </Link>
                            <div className="text-gray-500">
                              {image.latitude?.toFixed(2)},{' '}
                              {image.longitude?.toFixed(2)}
                            </div>
                            {image.hazard_type && (
                              <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-600 px-2 py-0.5 text-xs font-semibold">
                                {image.hazard_type}
                              </span>
                            )}
                          </motion.div>
                        </Popup>
                      </Marker>
                    ))}
                </MapContainer>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

const insightVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

interface MapInsightsProps {
  geocodedCount: number;
  missingCoordinates: number;
  hazardTypeCount: number;
}

function MapInsights({
  geocodedCount,
  missingCoordinates,
  hazardTypeCount,
}: MapInsightsProps) {
  const cards = [
    {
      label: 'Geocoded submissions',
      value: geocodedCount,
      sublabel: 'Ready to visualize',
      icon: MapPin,
    },
    {
      label: 'Needs location',
      value: missingCoordinates,
      sublabel: 'Follow up with field teams',
      icon: Image,
    },
    {
      label: 'Hazard types',
      value: hazardTypeCount,
      sublabel: 'Filters applied on the map',
      icon: Filter,
    },
  ];

  return (
    <motion.div
      className="grid grid-cols-1 gap-4 md:grid-cols-3"
      initial="hidden"
      animate="visible"
      transition={{ staggerChildren: 0.08 }}
    >
      {cards.map((card) => (
        <motion.div
          key={card.label}
          variants={insightVariants}
          className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-card backdrop-blur"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-pacific-500/15 p-2 text-pacific-200">
              <card.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-white/70">{card.label}</p>
              <p className="text-2xl font-semibold text-white">{card.value}</p>
              <p className="mt-1 text-xs text-white/60">{card.sublabel}</p>
            </div>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

function MapInsightsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {[1, 2, 3].map((key) => (
        <Skeleton key={key} className="h-24 w-full" />
      ))}
    </div>
  );
}

function MapLoadingState() {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-4 text-white/70"
      role="status"
    >
      <Skeleton className="h-8 w-48 bg-white/10" />
      <Skeleton className="h-4 w-64 bg-white/10" />
      <div className="flex gap-3">
        {[1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-12 w-12 rounded-full bg-white/10" />
        ))}
      </div>
      <p className="text-sm">Fetching the latest impact reports…</p>
    </div>
  );
}

function MapEmptyState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
      <h2 className="text-xl font-semibold text-white">
        No geocoded submissions yet
      </h2>
      <p className="text-sm text-white/70">
        We have not received any reports with coordinates. Invite field teams to
        capture latitude/longitude or retry the sync once new data lands.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/upload"
          className="rounded-full bg-gradient-to-r from-pacific-500 to-coral-500 px-5 py-2 text-sm font-semibold text-white shadow-card transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
        >
          Upload a new report
        </Link>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition hover:-translate-y-0.5 hover:border-white/40 hover:text-white"
        >
          Refresh data
        </button>
      </div>
    </div>
  );
}

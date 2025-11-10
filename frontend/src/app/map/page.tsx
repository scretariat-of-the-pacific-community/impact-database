'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { MapPinIcon, PhotoIcon, FunnelIcon } from '@heroicons/react/24/outline';

import { imageApi } from '@/lib/api';
import { configureLeafletIcons } from '@/lib/leaflet-config';
import ErrorBoundary from '@/components/ErrorBoundary';
import ErrorBanner from '@/components/ErrorBanner';
import Skeleton from '@/components/design-system/Skeleton';
import { trackMapInteraction } from '@/lib/analytics';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });
const MapUsageTracker = dynamic(
  () =>
    import('react-leaflet').then(({ useMapEvents }) => {
      return function Tracker() {
        useMapEvents({
          moveend: (event) => {
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
    queryFn: () => imageApi.search({ limit: 1000 })
  });

  const images = data?.images || [];
  const imagesWithCoordinates = images.filter(
    (img) => typeof img.latitude === 'number' && typeof img.longitude === 'number'
  );
  const errorMessage = error instanceof Error ? error.message : 'Unable to load map data';

  useEffect(() => {
    if (imagesWithCoordinates.length > 0) {
      trackMapInteraction('view_loaded', { zoom: 2 });
    }
  }, [imagesWithCoordinates.length]);

  const geocodedCount = imagesWithCoordinates.length;
  const missingCoordinates = Math.max(images.length - geocodedCount, 0);
  const hazardTypeCount = new Set(
    imagesWithCoordinates
      .map((img) => img.hazard_type)
      .filter((type): type is string => Boolean(type))
  ).size;

  return (
    <ErrorBoundary boundaryName="map view">
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-6xl mx-auto space-y-6">
          <h1 className="text-3xl font-bold text-gray-800">Map View</h1>

          {isLoading ? (
            <MapInsightsSkeleton />
          ) : (
            <MapInsights
              geocodedCount={geocodedCount}
              missingCoordinates={missingCoordinates}
              hazardTypeCount={hazardTypeCount}
            />
          )}

          <div className="h-[600px] bg-white rounded-lg shadow-md overflow-hidden flex items-center justify-center">
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
                <MapContainer center={[0, 0]} zoom={2} className="h-full w-full">
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution="&copy; OpenStreetMap contributors"
                  />
                  <MapUsageTracker />
                  {createCustomIcon && imagesWithCoordinates.map((image, index) => (
                    <Marker
                      key={image.id}
                      position={[image.latitude!, image.longitude!] as [number, number]}
                      icon={createCustomIcon(image.hazard_type)}
                    >
                      <Popup>
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.01 }}
                          className="text-sm space-y-1"
                        >
                          <Link href={`/images/${image.id}`} className="text-blue-600 hover:underline font-medium">
                            {image.title || image.filename}
                          </Link>
                          <div className="text-gray-500">
                            {image.latitude?.toFixed(2)}, {image.longitude?.toFixed(2)}
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

function MapInsights({ geocodedCount, missingCoordinates, hazardTypeCount }: MapInsightsProps) {
  const cards = [
    {
      label: 'Geocoded submissions',
      value: geocodedCount,
      sublabel: 'Ready to visualize',
      icon: MapPinIcon,
    },
    {
      label: 'Needs location',
      value: missingCoordinates,
      sublabel: 'Follow up with field teams',
      icon: PhotoIcon,
    },
    {
      label: 'Hazard types',
      value: hazardTypeCount,
      sublabel: 'Filters applied on the map',
      icon: FunnelIcon,
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
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <card.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-slate-500">{card.label}</p>
              <p className="text-2xl font-semibold text-slate-900">{card.value}</p>
              <p className="text-xs text-slate-500 mt-1">{card.sublabel}</p>
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
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-gray-600" role="status">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-64" />
      <div className="flex gap-3">
        {[1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-12 w-12 rounded-full" />
        ))}
      </div>
      <p className="text-sm">Fetching the latest impact reports…</p>
    </div>
  );
}

function MapEmptyState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
      <h2 className="text-xl font-semibold text-slate-900">No geocoded submissions yet</h2>
      <p className="text-sm text-slate-600">
        We have not received any reports with coordinates. Invite field teams to capture latitude/longitude or retry the
        sync once new data lands.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/upload"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Upload a new report
        </Link>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
        >
          Refresh data
        </button>
      </div>
    </div>
  );
}

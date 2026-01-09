'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { HAZARD_TYPE_LABELS, HazardType } from '@/lib/types';
import { getCountryName } from '@/lib/countries';

// Color map aligned with HazardType enum
const hazardColorMap: Record<HazardType | string, string> = {
  earthquake: '#E69F00',
  flood: '#0072B2',
  tsunami: '#56B4E9',
  cyclone: '#CC79A7',
  drought: '#F0E442',
  landslide: '#009E73',
  wildfire: '#D55E00',
  volcanic: '#332288',
  coastal_erosion: '#999999',
  other: '#666666',
};

const getHazardLabel = (hazard: string): string => {
  return (
    HAZARD_TYPE_LABELS[hazard as HazardType] ||
    hazard.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
};

const getHazardColor = (hazard: string): string => {
  return (
    hazardColorMap[hazard as HazardType] || hazardColorMap.other || '#3b82f6'
  );
};

interface Location {
  id: string;
  latitude: number;
  longitude: number;
  hazard: string;
  country: string;
  uploads: number;
}

interface AnalyticsMapProps {
  locations: Location[];
  bounds: [[number, number], [number, number]] | [[number, number]];
}

/**
 * Wrapper component for Leaflet map that properly handles React Strict Mode.
 * Uses vanilla Leaflet API (not react-leaflet) with synchronous cleanup.
 */
export default function AnalyticsMap({ locations, bounds }: AnalyticsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const isInitializingRef = useRef(false);
  const cleanupExecutedRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || locations.length === 0) {
      return;
    }

    // Prevent concurrent initialization
    if (isInitializingRef.current) {
      return;
    }

    // Reset cleanup flag when effect runs
    cleanupExecutedRef.current = false;
    let mounted = true;

    const initMap = async () => {
      isInitializingRef.current = true;

      try {
        const L = (await import('leaflet')).default;

        if (!mounted || !container) {
          isInitializingRef.current = false;
          return;
        }

        // If map already exists on this container, just update markers
        if (mapRef.current && mapRef.current.getContainer() === container) {
          updateMarkers(L);
          isInitializingRef.current = false;
          return;
        }

        // Clean up any existing map with extra safety
        if (mapRef.current) {
          try {
            mapRef.current.off();
            mapRef.current.remove();
          } catch (e) {
            console.warn('Error removing existing map:', e);
          }
          mapRef.current = null;
          markersRef.current = null;
        }

        // Clean orphaned Leaflet state from container
        if ((container as any)._leaflet_id) {
          delete (container as any)._leaflet_id;
        }

        // Clear container children (any leftover map elements)
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }

        // Small delay to ensure DOM is cleared
        await new Promise((resolve) => setTimeout(resolve, 10));

        if (!mounted) {
          isInitializingRef.current = false;
          return;
        }

        // Create map
        const map = L.map(container, {
          scrollWheelZoom: false,
          worldCopyJump: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap',
        }).addTo(map);

        mapRef.current = map;
        markersRef.current = L.layerGroup().addTo(map);

        updateMarkers(L);
      } finally {
        isInitializingRef.current = false;
      }
    };

    const updateMarkers = (L: any) => {
      const map = mapRef.current;
      const markersLayer = markersRef.current;

      if (!map || !markersLayer) return;

      // Fit bounds
      try {
        if (
          bounds.length === 2 &&
          Array.isArray(bounds[0]) &&
          Array.isArray(bounds[1])
        ) {
          map.fitBounds(bounds, { padding: [20, 20] });
        } else if (bounds.length >= 1) {
          map.setView(bounds[0], 5);
        }
      } catch {
        map.setView([0, 0], 2);
      }

      // Clear and add markers
      markersLayer.clearLayers();

      locations.forEach((location) => {
        const marker = L.circleMarker([location.latitude, location.longitude], {
          radius: 8,
          fillColor: getHazardColor(location.hazard),
          color: '#fff',
          weight: 2,
          opacity: 0.8,
          fillOpacity: 0.6,
        });

        marker.bindTooltip(
          `<div class="text-xs">
            <p class="font-semibold">${getCountryName(location.country)}</p>
            <p>Hazard: ${getHazardLabel(location.hazard)}</p>
          </div>`,
          { direction: 'top' }
        );

        markersLayer.addLayer(marker);
      });

      // Force size recalculation
      requestAnimationFrame(() => {
        try {
          map.invalidateSize();
        } catch {
          // Ignore
        }
      });
    };

    initMap();

    // Cleanup function - runs synchronously before next effect
    return () => {
      mounted = false;

      // Prevent duplicate cleanup
      if (cleanupExecutedRef.current) {
        return;
      }
      cleanupExecutedRef.current = true;

      // Synchronously clean up the map to prevent "already initialized" error
      if (mapRef.current) {
        try {
          mapRef.current.off();
          mapRef.current.remove();
        } catch (e) {
          console.warn('Cleanup error:', e);
        }
        mapRef.current = null;
        markersRef.current = null;
      }

      // Clean container's Leaflet ID
      if (container && (container as any)._leaflet_id) {
        delete (container as any)._leaflet_id;
      }

      // Clear initialization flag
      isInitializingRef.current = false;
    };
  }, [locations, bounds]);

  if (locations.length === 0) {
    return (
      <div className="h-96 rounded-xl bg-slate-800/50 flex items-center justify-center">
        <div className="text-white/50 text-sm">No location data available</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-96 rounded-xl overflow-hidden"
      style={{ height: '384px', width: '100%' }}
    />
  );
}

'use client';

import { useEffect, useRef, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

interface ImageRecord {
  id: string;
  latitude?: number | null;
  longitude?: number | null;
  hazard_type?: string | null;
}

interface InteractiveHeroMapProps {
  images?: ImageRecord[];
}

export default function InteractiveHeroMap({ images = [] }: InteractiveHeroMapProps) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const markers = useMemo(() => {
    return images
      .filter((img) => img.latitude != null && img.longitude != null)
      .map((img) => ({
        id: img.id,
        latitude: img.latitude!,
        longitude: img.longitude!,
        hazard: img.hazard_type || 'unknown',
      }));
  }, [images]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !mapboxgl.accessToken) return;

    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [179.4144, -8.6196],
      zoom: 3.5,
      pitch: 45,
      bearing: -20,
      projection: 'globe',
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');

    mapRef.current.on('style.load', () => {
      mapRef.current?.setFog({
        color: 'rgba(3, 7, 18, 0.5)',
        'high-color': '#add8ff',
        'space-color': '#010409',
        'horizon-blend': 0.4,
      });
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (map.getSource('hero-points')) {
      const source = map.getSource('hero-points') as mapboxgl.GeoJSONSource;
      source.setData({
        type: 'FeatureCollection',
        features: markers.map((marker) => ({
          type: 'Feature',
          properties: {
            hazard: marker.hazard ?? 'unknown',
          },
          geometry: {
            type: 'Point',
            coordinates: [marker.longitude, marker.latitude],
          },
        })),
      });
      return;
    }

    map.addSource('hero-points', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: markers.map((marker) => ({
          type: 'Feature',
          properties: {
            hazard: marker.hazard ?? 'unknown',
          },
          geometry: {
            type: 'Point',
            coordinates: [marker.longitude, marker.latitude],
          },
        })),
      },
      cluster: true,
      clusterRadius: 40,
    });

    map.addLayer({
      id: 'hero-points-cluster',
      type: 'circle',
      source: 'hero-points',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': [
          'step',
          ['get', 'point_count'],
          '#009ee0',
          10,
          '#ff6b4a',
          25,
          '#18b374',
        ],
        'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 25, 32],
        'circle-opacity': 0.75,
      },
    });

    map.addLayer({
      id: 'hero-points-cluster-count',
      type: 'symbol',
      source: 'hero-points',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
        'text-size': 12,
      },
      paint: {
        'text-color': '#0f172a',
      },
    });

    map.addLayer({
      id: 'hero-point',
      type: 'circle',
      source: 'hero-points',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': '#fff',
        'circle-radius': 6,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#009ee0',
      },
    });
  }, [markers]);

  // Fallback if no Mapbox token
  if (!mapboxgl.accessToken) {
    return (
      <div className="absolute inset-0 overflow-hidden">
        <div className="h-full w-full bg-gradient-to-r from-deep-900/60 to-pacific-900/40" />
        <div className="absolute inset-0 bg-gradient-to-r from-deep-950/95 via-deep-900/70 to-pacific-900/60" />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute inset-0 bg-gradient-to-r from-deep-950/95 via-deep-900/70 to-pacific-900/60" />
    </div>
  );
}

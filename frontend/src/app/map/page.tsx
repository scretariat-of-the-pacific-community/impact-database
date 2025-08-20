'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';

import { imageApi } from '@/lib/api';
import { configureLeafletIcons } from '@/lib/leaflet-config';
import { createCustomIcon } from '@/lib/mapUtils';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });

export default function MapPage() {
  useEffect(() => {
    configureLeafletIcons();
  }, []);

  const { data } = useQuery({
    queryKey: ['map-images'],
    queryFn: () => imageApi.search({ limit: 1000 })
  });

  const images = data?.images || [];

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">Map View</h1>

        <div className="h-[600px] bg-white rounded-lg shadow-md overflow-hidden">
          <MapContainer center={[0, 0]} zoom={2} className="h-full w-full">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />
            {images.filter(img => img.latitude && img.longitude).map(image => (
              <Marker
                key={image.id}
                position={[image.latitude, image.longitude] as [number, number]}
                icon={createCustomIcon(image.hazard_type)}
              >
                <Popup>
                  <div className="text-sm">
                    <Link href={`/images/${image.id}`} className="text-blue-600 hover:underline">
                      {image.title || image.filename}
                    </Link>
                    <div className="text-gray-500">
                      {image.latitude.toFixed(2)}, {image.longitude.toFixed(2)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}

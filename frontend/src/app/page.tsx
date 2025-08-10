'use client';

import { useQuery } from '@tanstack/react-query';
import { imageApi } from '@/lib/api';
import { Upload, MapPin, Calendar, Image } from 'lucide-react';
import Link from 'next/link';

export default function Dashboard() {
  const { data: images, isLoading, error } = useQuery({
    queryKey: ['images'],
    queryFn: () => imageApi.getAll().then(res => res.data),
  });

  const stats = {
    total: images?.length || 0,
    hazardTypes: new Set(images?.map(img => img.hazard_type)).size || 0,
    countries: new Set(images?.map(img => img.country).filter(Boolean)).size || 0,
    withCoordinates: images?.filter(img => img.latitude && img.longitude).length || 0,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <h1 className="text-3xl font-bold text-gray-900">Impact Database</h1>
            <Link 
              href="/upload" 
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Upload Image
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <Image className="w-8 h-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Images</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <Calendar className="w-8 h-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Hazard Types</p>
                <p className="text-2xl font-bold text-gray-900">{stats.hazardTypes}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <MapPin className="w-8 h-8 text-red-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Countries</p>
                <p className="text-2xl font-bold text-gray-900">{stats.countries}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <MapPin className="w-8 h-8 text-purple-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Geolocated</p>
                <p className="text-2xl font-bold text-gray-900">{stats.withCoordinates}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Link href="/images" className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Browse Images</h3>
            <p className="text-gray-600">View and search all uploaded images with metadata</p>
          </Link>
          
          <Link href="/map" className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Map View</h3>
            <p className="text-gray-600">Explore images on an interactive map</p>
          </Link>
          
          <Link href="/hazards" className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Hazard Analysis</h3>
            <p className="text-gray-600">Analyze images by hazard type and location</p>
          </Link>
        </div>

        {/* Recent Images */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Recent Images</h2>
          </div>
          <div className="p-6">
            {isLoading ? (
              <p>Loading...</p>
            ) : error ? (
              <p className="text-red-600">Error loading images</p>
            ) : images && images.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {images.slice(0, 6).map((image) => (
                  <div key={image.filename} className="border rounded-lg p-4">
                    <h4 className="font-medium text-gray-900">{image.filename}</h4>
                    <p className="text-sm text-gray-600 capitalize">{image.hazard_type}</p>
                    <p className="text-sm text-gray-500">{image.location}</p>
                    {image.latitude && image.longitude && (
                      <p className="text-xs text-gray-400">
                        {image.latitude.toFixed(4)}, {image.longitude.toFixed(4)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No images uploaded yet</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

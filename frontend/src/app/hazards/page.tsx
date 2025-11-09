'use client';

import { useQuery } from '@tanstack/react-query';
import { imageApi } from '@/lib/api';
import { ArrowLeft, BarChart3, MapPin, Calendar, TrendingUp, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import React, { useMemo, useState } from 'react';
import type { ImageMetadata as SharedImageMetadata } from '@/lib/types';

// Extend ImageMetadata to include all required properties for this page
type ImageMetadata = SharedImageMetadata & {
  country?: string | null;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timestamp?: string | null;
  filename: string;
  title?: string | null;
  hazard_type: string;
};

interface HazardStats {
  hazard_type: string;
  count: number;
  countries: string[];
  latestDate?: string;
  locations: string[];
}

interface HazardStatsInternal {
  hazard_type: string;
  count: number;
  countriesSet: Set<string>;
  latestDate?: string;
  locationsSet: Set<string>;
}

export default function HazardAnalysisPage() {
  const [selectedHazard, setSelectedHazard] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['hazard-images'],
    queryFn: () => imageApi.search({ limit: 1000 }),
  });

  const images = (data?.images as ImageMetadata[]) || [];

  const hazardStats = useMemo(() => {
    if (!images || images.length === 0) return [] as HazardStats[];

    const statsMap = new Map<string, HazardStatsInternal>();

    images.forEach((image) => {
      const hazard = image.hazard_type;
      if (!hazard) return;

      if (!statsMap.has(hazard)) {
        statsMap.set(hazard, {
          hazard_type: hazard,
          count: 0,
          countriesSet: new Set<string>(),
          locationsSet: new Set<string>(),
        });
      }

      const stats = statsMap.get(hazard)!;
      stats.count += 1;

      if (image.country) {
        stats.countriesSet.add(image.country);
      }

      if (image.location) {
        stats.locationsSet.add(image.location);
      }

      if (image.timestamp) {
        const imageDate = new Date(image.timestamp);
        if (!stats.latestDate || imageDate > new Date(stats.latestDate)) {
          stats.latestDate = image.timestamp;
        }
      }
    });

    // Convert Sets to arrays and create final stats objects
    return Array.from(statsMap.values())
      .map((stats) => ({
        hazard_type: stats.hazard_type,
        count: stats.count,
        countries: Array.from(stats.countriesSet),
        locations: Array.from(stats.locationsSet),
        latestDate: stats.latestDate,
      }))
      .sort((a, b) => b.count - a.count);
  }, [images]);

  const totalImages = images.length;
  const totalCountries = useMemo(() => {
    const countries = images
      .map((img) => img.country)
      .filter((country): country is string => Boolean(country));
    return new Set(countries).size;
  }, [images]);

  const geolocatedImages = useMemo(() => {
    return images.filter((img) => typeof img.latitude === 'number' && typeof img.longitude === 'number').length;
  }, [images]);

  const selectedHazardImages = useMemo(() => {
    if (!selectedHazard) return [] as ImageMetadata[];
    return images.filter((img) => img.hazard_type === selectedHazard);
  }, [images, selectedHazard]);

  const getHazardColor = (hazard: string) => {
    const colors: Record<string, string> = {
      flood: 'bg-blue-100 text-blue-800 border-blue-200',
      cyclone: 'bg-cyan-100 text-cyan-800 border-cyan-200',
      drought: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      earthquake: 'bg-gray-100 text-gray-800 border-gray-200',
      tsunami: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      landslide: 'bg-orange-100 text-orange-800 border-orange-200',
      wildfire: 'bg-red-100 text-red-800 border-red-200',
    };
    return colors[hazard] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getHazardIcon = (hazard: string) => {
    switch (hazard) {
      case 'flood':
        return '🌊';
      case 'cyclone':
        return '🌀';
      case 'drought':
        return '🏜️';
      case 'earthquake':
        return '🫨';
      case 'tsunami':
        return '🌊';
      case 'landslide':
        return '⛰️';
      case 'wildfire':
        return '🔥';
      default:
        return '⚠️';
    }
  };

  const errorMessage = error instanceof Error ? error.message : 'Unknown error fetching hazard data';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center py-6">
            <Link href="/" className="mr-4">
              <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-gray-900" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Hazard Analysis</h1>
              <p className="text-gray-600">Analyze disaster and hazard patterns by type and location</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading hazard data...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-md p-6 text-center">
            <p className="text-red-800">Error loading hazard data: {errorMessage}</p>
          </div>
        ) : images.length === 0 ? (
          <div className="bg-white p-6 rounded-lg shadow text-center text-gray-600">
            No hazard imagery available yet. Try uploading new imagery to see analytics here.
          </div>
        ) : (
          <>
            {/* Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="flex items-center">
                  <BarChart3 className="w-8 h-8 text-blue-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Images</p>
                    <p className="text-2xl font-bold text-gray-900">{totalImages}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow">
                <div className="flex items-center">
                  <AlertTriangle className="w-8 h-8 text-orange-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Hazard Types</p>
                    <p className="text-2xl font-bold text-gray-900">{hazardStats.length}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow">
                <div className="flex items-center">
                  <MapPin className="w-8 h-8 text-green-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Countries Affected</p>
                    <p className="text-2xl font-bold text-gray-900">{totalCountries}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow">
                <div className="flex items-center">
                  <TrendingUp className="w-8 h-8 text-purple-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Geolocated</p>
                    <p className="text-2xl font-bold text-gray-900">{geolocatedImages}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Hazard Types Grid */}
            <div className="bg-white p-6 rounded-lg shadow mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Hazard Types Overview</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {hazardStats.map((hazard) => (
                  <div
                    key={hazard.hazard_type}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${
                      selectedHazard === hazard.hazard_type
                        ? 'ring-2 ring-blue-500 ' + getHazardColor(hazard.hazard_type)
                        : getHazardColor(hazard.hazard_type)
                    }`}
                    onClick={() =>
                      setSelectedHazard(
                        selectedHazard === hazard.hazard_type ? '' : hazard.hazard_type
                      )
                    }
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center">
                        <span className="text-2xl mr-3">{getHazardIcon(hazard.hazard_type)}</span>
                        <h3 className="font-semibold capitalize">{hazard.hazard_type}</h3>
                      </div>
                      <span className="text-2xl font-bold">{hazard.count}</span>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium">Countries: </span>
                        <span>{hazard.countries.length || 'Unknown'}</span>
                      </div>
                      <div>
                        <span className="font-medium">Locations: </span>
                        <span>{hazard.locations.length}</span>
                      </div>
                      {hazard.latestDate && (
                        <div>
                          <span className="font-medium">Latest: </span>
                          <span>{new Date(hazard.latestDate).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 pt-3 border-t border-current border-opacity-20">
                      <Link
                        href={`/hazards/${hazard.hazard_type}`}
                        className="text-sm font-medium hover:underline"
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        View Details →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Selected Hazard Details */}
            {selectedHazard && selectedHazardImages.length > 0 && (
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="flex items-center mb-6">
                  <span className="text-3xl mr-3">{getHazardIcon(selectedHazard)}</span>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 capitalize">
                      {selectedHazard} Events
                    </h2>
                    <p className="text-gray-600">
                      {selectedHazardImages.length} images from {
                        new Set(
                          selectedHazardImages
                            .map((img) => img.location)
                            .filter((loc): loc is string => Boolean(loc))
                        ).size
                      } locations
                    </p>
                  </div>
                </div>

                {/* Location breakdown */}
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Affected Locations</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(
                      selectedHazardImages.reduce((acc: Record<string, number>, img) => {
                        const key = img.country ? `${img.location}, ${img.country}` : img.location;
                        const safeKey = key || 'Unknown location';
                        acc[safeKey] = (acc[safeKey] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>)
                    ).map(([location, count]) => (
                      <div
                        key={location}
                        className="flex justify-between items-center p-3 bg-gray-50 rounded"
                      >
                        <span className="text-sm font-medium">{location}</span>
                        <span className="text-sm text-gray-600">{count} images</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent images */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Recent Images</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {selectedHazardImages
                      .slice()
                      .sort((a, b) => {
                        if (!a.timestamp && !b.timestamp) return 0;
                        if (!a.timestamp) return 1;
                        if (!b.timestamp) return -1;
                        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
                      })
                      .slice(0, 6)
                      .map((image) => (
                        <div
                          key={image.filename}
                          className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                        >
                          <h4 className="font-medium text-gray-900 mb-2 truncate">
                            {image.title || image.filename}
                          </h4>
                          <div className="space-y-1 text-sm text-gray-600">
                            <div className="flex items-center">
                              <MapPin className="w-3 h-3 mr-1" />
                              <span className="truncate">{image.location || 'Unknown location'}</span>
                            </div>
                            {image.timestamp && (
                              <div className="flex items-center">
                                <Calendar className="w-3 h-3 mr-1" />
                                <span>{new Date(image.timestamp).toLocaleDateString()}</span>
                              </div>
                            )}
                          </div>
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <Link
                              href={`/images/${encodeURIComponent(image.filename)}`}
                              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                            >
                              View Details →
                            </Link>
                          </div>
                        </div>
                      ))}
                  </div>

                  {selectedHazardImages.length > 6 && (
                    <div className="mt-4 text-center">
                      <Link
                        href={`/images?hazard=${selectedHazard}`}
                        className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                      >
                        View All {selectedHazardImages.length} Images
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="mt-8 bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link
                  href="/images"
                  className="flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Browse All Images
                </Link>
                <Link
                  href="/map"
                  className="flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  View on Map
                </Link>
                <Link
                  href="/upload"
                  className="flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
                >
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Upload New Image
                </Link>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

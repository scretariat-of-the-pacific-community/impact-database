'use client';

import { useQuery } from '@tanstack/react-query';
import { imageApi } from '@/lib/api';
import { ArrowLeft, MapPin, Filter, Info } from 'lucide-react';
import Link from 'next/link';
import { useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import map components to avoid SSR issues
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);

const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);

const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
);

const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
);

interface MapFilters {
  hazardTypes: string[];
  dateRange: {
    start?: string;
    end?: string;
  };
  countries: string[];
}

export default function MapPage() {
  const [mapReady, setMapReady] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null);
  const [filters, setFilters] = useState<MapFilters>({
    hazardTypes: [],
    dateRange: {},
    countries: [],
  });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    setMapReady(true);
  }, []);

  const { data: images, isLoading, error } = useQuery({
    queryKey: ['images'],
    queryFn: () => imageApi.getAll().then(res => res.data),
  });

  // Filter images that have coordinates
  const geolocatedImages = useMemo(() => {
    if (!images) return [];
    return images.filter(img => img.latitude && img.longitude);
  }, [images]);

  // Apply filters
  const filteredImages = useMemo(() => {
    if (!geolocatedImages) return [];
    
    return geolocatedImages.filter(image => {
      // Hazard type filter
      if (filters.hazardTypes.length > 0 && !filters.hazardTypes.includes(image.hazard_type)) {
        return false;
      }
      
      // Country filter
      if (filters.countries.length > 0 && image.country && !filters.countries.includes(image.country)) {
        return false;
      }
      
      // Date range filter
      if (image.timestamp) {
        const imageDate = new Date(image.timestamp);
        if (filters.dateRange.start && imageDate < new Date(filters.dateRange.start)) {
          return false;
        }
        if (filters.dateRange.end && imageDate > new Date(filters.dateRange.end)) {
          return false;
        }
      }
      
      return true;
    });
  }, [geolocatedImages, filters]);

  // Get unique values for filters
  const uniqueHazardTypes = useMemo(() => {
    return [...new Set(geolocatedImages.map(img => img.hazard_type))].sort();
  }, [geolocatedImages]);

  const uniqueCountries = useMemo(() => {
    return [...new Set(geolocatedImages.map(img => img.country).filter((c): c is string => typeof c === 'string'))].sort();
  }, [geolocatedImages]);

  const getHazardColor = (hazard: string) => {
    const colors: Record<string, string> = {
      flood: '#3b82f6',
      cyclone: '#8b5cf6',
      drought: '#eab308',
      earthquake: '#ef4444',
      tsunami: '#06b6d4',
      landslide: '#f97316',
      wildfire: '#dc2626',
    };
    return colors[hazard] || '#6b7280';
  };

  const getHazardIcon = (hazard: string) => {
    switch (hazard) {
      case 'flood': return '🌊';
      case 'cyclone': return '🌀';
      case 'drought': return '🏜️';
      case 'earthquake': return '🫨';
      case 'tsunami': return '🌊';
      case 'landslide': return '⛰️';
      case 'wildfire': return '🔥';
      default: return '⚠️';
    }
  };

  const toggleHazardFilter = (hazard: string) => {
    setFilters(prev => ({
      ...prev,
      hazardTypes: prev.hazardTypes.includes(hazard)
        ? prev.hazardTypes.filter(h => h !== hazard)
        : [...prev.hazardTypes, hazard]
    }));
  };

  const toggleCountryFilter = (country: string) => {
    setFilters(prev => ({
      ...prev,
      countries: prev.countries.includes(country)
        ? prev.countries.filter(c => c !== country)
        : [...prev.countries, country]
    }));
  };

  const clearFilters = () => {
    setFilters({
      hazardTypes: [],
      dateRange: {},
      countries: [],
    });
  };

  if (!mapReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading map...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center">
              <Link href="/" className="mr-4">
                <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-gray-900" />
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Interactive Map</h1>
                <p className="text-gray-600">
                  Showing {filteredImages.length} of {geolocatedImages.length} geolocated images
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center px-4 py-2 rounded-md text-sm font-medium ${
                  showFilters
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                <Filter className="w-4 h-4 mr-2" />
                Filters
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="relative h-[calc(100vh-120px)]">
        {/* Filters Panel */}
        {showFilters && (
          <div className="absolute top-0 left-0 w-80 h-full bg-white shadow-lg z-20 overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
                <button
                  onClick={clearFilters}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Clear All
                </button>
              </div>

              {/* Hazard Types */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Hazard Types</h3>
                <div className="space-y-2">
                  {uniqueHazardTypes.map(hazard => (
                    <label key={hazard} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={filters.hazardTypes.includes(hazard)}
                        onChange={() => toggleHazardFilter(hazard)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700 capitalize flex items-center">
                        <span className="mr-2">{getHazardIcon(hazard)}</span>
                        {hazard}
                        <span className="ml-auto text-xs text-gray-500">
                          ({geolocatedImages.filter(img => img.hazard_type === hazard).length})
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Countries */}
              {uniqueCountries.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Countries</h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {uniqueCountries.map(country => (
                      <label key={country} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={filters.countries.includes(country)}
                          onChange={() => toggleCountryFilter(country)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-700 flex items-center justify-between w-full">
                          {country}
                          <span className="text-xs text-gray-500">
                            ({geolocatedImages.filter(img => img.country === country).length})
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Date Range */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Date Range</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">From</label>
                    <input
                      type="date"
                      value={filters.dateRange.start || ''}
                      onChange={(e) => setFilters(prev => ({
                        ...prev,
                        dateRange: { ...prev.dateRange, start: e.target.value }
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">To</label>
                    <input
                      type="date"
                      value={filters.dateRange.end || ''}
                      onChange={(e) => setFilters(prev => ({
                        ...prev,
                        dateRange: { ...prev.dateRange, end: e.target.value }
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Legend</h3>
                <div className="space-y-2">
                  {uniqueHazardTypes.map(hazard => (
                    <div key={hazard} className="flex items-center text-sm">
                      <div
                        className="w-4 h-4 rounded-full mr-2"
                        style={{ backgroundColor: getHazardColor(hazard) }}
                      />
                      <span className="capitalize">{hazard}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Map Container */}
        <div className={`h-full ${showFilters ? 'ml-80' : ''} transition-all duration-300`}>
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading map data...</p>
              </div>
            </div>
          ) : error ? (
            <div className="h-full flex items-center justify-center">
              <div className="bg-red-50 border border-red-200 rounded-md p-6">
                <p className="text-red-800">Error loading map data: {error.message}</p>
              </div>
            </div>
          ) : (
            <MapContainer
              center={[-17.7334, 168.3273]} // Default to Vanuatu
              zoom={6}
              style={{ height: '100%', width: '100%' }}
              className="z-0"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              
              {filteredImages.map((image) => (
                <Marker
                  key={image.filename}
                  position={[image.latitude!, image.longitude!]}
                  eventHandlers={{
                    click: () => setSelectedMarker(image.filename),
                  }}
                >
                  <Popup>
                    <div className="min-w-[250px]">
                      <div className="flex items-center mb-2">
                        <span className="text-lg mr-2">{getHazardIcon(image.hazard_type)}</span>
                        <h3 className="font-semibold text-gray-900">
                          {image.title || image.filename}
                        </h3>
                      </div>
                      
                      <div className="space-y-1 text-sm text-gray-600 mb-3">
                        <div className="flex items-center">
                          <MapPin className="w-3 h-3 mr-1" />
                          <span>{image.location}</span>
                          {image.country && <span className="ml-1">({image.country})</span>}
                        </div>
                        
                        <div>
                          <span className="font-medium">Type: </span>
                          <span className="capitalize">{image.hazard_type}</span>
                        </div>
                        
                        {image.timestamp && (
                          <div>
                            <span className="font-medium">Date: </span>
                            <span>{new Date(image.timestamp).toLocaleDateString()}</span>
                          </div>
                        )}
                        
                        <div>
                          <span className="font-medium">Coordinates: </span>
                          <span>{image.latitude!.toFixed(4)}, {image.longitude!.toFixed(4)}</span>
                        </div>
                      </div>
                      
                      {image.abstract && (
                        <p className="text-sm text-gray-700 mb-3 line-clamp-3">
                          {image.abstract}
                        </p>
                      )}
                      
                      <Link
                        href={`/images/${encodeURIComponent(image.filename)}`}
                        className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        <Info className="w-3 h-3 mr-1" />
                        View Details
                      </Link>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          )}
        </div>
      </div>

      {/* Stats Footer */}
      <div className="bg-white border-t border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-sm text-gray-600">
          <div>
            Total: {images?.length || 0} images | 
            Geolocated: {geolocatedImages.length} | 
            Displayed: {filteredImages.length}
          </div>
          <div className="flex items-center space-x-4">
            <Link href="/images" className="text-blue-600 hover:text-blue-700">
              Browse All Images
            </Link>
            <Link href="/hazards" className="text-blue-600 hover:text-blue-700">
              Hazard Analysis
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
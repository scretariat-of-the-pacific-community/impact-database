'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Search, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/design-system';

// Fix for default marker icons in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom marker icon with Pacific theme
const createCustomIcon = () => {
  return L.divIcon({
    className: 'custom-map-marker',
    html: `
      <div style="
        width: 36px;
        height: 36px;
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        border: 3px solid white;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg style="
          width: 20px;
          height: 20px;
          transform: rotate(45deg);
          color: white;
        " fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd" />
        </svg>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
  });
};

interface GeocodingResult {
  lat: number;
  lon: number;
  display_name: string;
  address: {
    country?: string;
    country_code?: string;
    state?: string;
    city?: string;
    town?: string;
    village?: string;
  };
}

interface LocationData {
  lat: number;
  lng: number;
  placeName: string;
  countryCode?: string;
}

interface MapPickerProps {
  initialPosition?: [number, number];
  onConfirm: (data: LocationData) => void;
  onCancel: () => void;
}

// Component to handle map clicks and marker placement
function LocationMarker({ 
  position, 
  setPosition 
}: { 
  position: [number, number] | null;
  setPosition: (pos: [number, number]) => void;
}) {
  const map = useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });

  return position ? (
    <Marker position={position} icon={createCustomIcon()} />
  ) : null;
}

// Component to fly to a new position
function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  
  useEffect(() => {
    map.flyTo(center, 13, {
      duration: 1.5,
      easeLinearity: 0.25,
    });
  }, [center, map]);
  
  return null;
}

export default function MapPicker({ initialPosition, onConfirm, onCancel }: MapPickerProps) {
  const defaultCenter: [number, number] = [-17.7334, 168.3273]; // Port Vila, Pacific center
  const [position, setPosition] = useState<[number, number] | null>(
    initialPosition || null
  );
  const [mapCenter, setMapCenter] = useState<[number, number]>(
    initialPosition || defaultCenter
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [placeName, setPlaceName] = useState<string>('');
  const [countryCode, setCountryCode] = useState<string>('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  // Reverse geocode a position to get place name
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    setIsReverseGeocoding(true);
    setSearchError(null);
    
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'en',
          },
        }
      );
      
      if (!response.ok) {
        throw new Error('Geocoding service unavailable');
      }
      
      const data: GeocodingResult = await response.json();
      
      // Build a human-readable place name
      const parts = [
        data.address.village || data.address.town || data.address.city,
        data.address.state,
        data.address.country,
      ].filter(Boolean);
      
      const name = parts.length > 0 ? parts.join(', ') : 'Unknown location';
      setPlaceName(name);
      setCountryCode(data.address.country_code?.toUpperCase() || '');
      
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      setPlaceName(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      setSearchError('Could not determine place name');
    } finally {
      setIsReverseGeocoding(false);
    }
  }, []);

  // Search for a location by name
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    setSearchError(null);
    
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&addressdetails=1&limit=1`,
        {
          headers: {
            'Accept-Language': 'en',
          },
        }
      );
      
      if (!response.ok) {
        throw new Error('Search service unavailable');
      }
      
      const results: GeocodingResult[] = await response.json();
      
      if (results.length === 0) {
        setSearchError('Location not found. Try a different search term.');
        return;
      }
      
      const result = results[0];
      const newPosition: [number, number] = [parseFloat(result.lat.toString()), parseFloat(result.lon.toString())];
      
      setPosition(newPosition);
      setMapCenter(newPosition);
      
      // Build place name
      const parts = [
        result.address.village || result.address.town || result.address.city,
        result.address.state,
        result.address.country,
      ].filter(Boolean);
      
      setPlaceName(parts.length > 0 ? parts.join(', ') : result.display_name);
      setCountryCode(result.address.country_code?.toUpperCase() || '');
      
    } catch (error) {
      console.error('Search error:', error);
      setSearchError('Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  // Handle position change
  const handlePositionChange = useCallback((newPosition: [number, number]) => {
    setPosition(newPosition);
    reverseGeocode(newPosition[0], newPosition[1]);
  }, [reverseGeocode]);

  // Use device location
  const useDeviceLocation = useCallback(async () => {
    const isSecureContext =
      typeof window !== 'undefined' &&
      (window.isSecureContext || ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname));

    if (!isSecureContext) {
      setSearchError('Location access only works over HTTPS or localhost. Please switch to a secure connection or drop a pin manually.');
      return;
    }

    if (!navigator.geolocation) {
      setSearchError('Geolocation not supported by your browser');
      return;
    }
    
    setIsSearching(true);
    setSearchError(null);

    try {
      if (navigator.permissions?.query) {
        const permissionStatus = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (permissionStatus.state === 'denied') {
          setIsSearching(false);
          setSearchError('Browser blocked location sharing. Please enable permissions or drop a pin manually.');
          return;
        }
      }
    } catch (permissionCheckError) {
      console.warn('Unable to verify geolocation permission:', permissionCheckError);
    }

    const handleSuccess = (position: GeolocationPosition) => {
      const newPosition: [number, number] = [
        position.coords.latitude,
        position.coords.longitude,
      ];
      setPosition(newPosition);
      setMapCenter(newPosition);
      reverseGeocode(newPosition[0], newPosition[1]);
      setIsSearching(false);
    };

    const handleError = (error: unknown) => {
      // Geolocation errors are expected when users deny permission or it's unavailable
      // No need to log to console as we handle it gracefully with user-friendly messages
      
      const blockedNames = ['SecurityError', 'NotAllowedError', 'PermissionDeniedError'];
      let blockedByPolicy = false;
      
      if (error instanceof DOMException) {
        blockedByPolicy = blockedNames.includes(error.name);
      } else if (error && typeof error === 'object') {
        if ('code' in error) {
          const posError = error as GeolocationPositionError;
          blockedByPolicy = posError.code === 1;
        } else if ('name' in error && typeof (error as { name?: string }).name === 'string') {
          blockedByPolicy = blockedNames.includes((error as { name?: string }).name!);
        }
      } else if (typeof error === 'string') {
        blockedByPolicy = blockedNames.some((name) => error.includes(name));
      }
      
      setSearchError(
        blockedByPolicy
          ? 'Browser blocked location sharing. Please enable permissions or drop a pin manually.'
          : 'Could not get your location. Please check permissions.'
      );
      setIsSearching(false);
    };
    
    try {
      navigator.geolocation.getCurrentPosition(
        handleSuccess,
        handleError,
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    } catch (syncError) {
      handleError(syncError);
    }
  }, [reverseGeocode]);

  // Handle confirm
  const handleConfirm = useCallback(() => {
    if (!position) return;
    
    onConfirm({
      lat: position[0],
      lng: position[1],
      placeName: placeName || `${position[0].toFixed(6)}, ${position[1].toFixed(6)}`,
      countryCode: countryCode || undefined,
    });
  }, [position, placeName, countryCode, onConfirm]);

  // Handle Enter key in search
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl h-[600px] bg-deep-950 rounded-2xl shadow-2xl border border-white/10 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-deep-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-pacific-500/20">
              <MapPin className="w-5 h-5 text-pacific-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Select Location</h2>
              <p className="text-xs text-surface-soft">Click on the map or search for a location</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 text-surface-soft hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Close map picker"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-white/10 bg-deep-900/30">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-soft" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search for a city, country, or landmark..."
                className="w-full pl-10 pr-4 py-2 bg-deep-900/60 border border-white/20 rounded-lg text-white placeholder-surface-soft/50 focus:outline-none focus:ring-2 focus:ring-pacific-500 focus:border-transparent"
                disabled={isSearching}
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={!searchQuery.trim() || isSearching}
              variant="secondary"
              size="md"
              leftIcon={isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            >
              Search
            </Button>
            <Button
              onClick={useDeviceLocation}
              disabled={isSearching}
              variant="secondary"
              size="md"
              leftIcon={isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
              className="hidden sm:flex"
            >
              My Location
            </Button>
          </div>

          {/* Search Error */}
          {searchError && (
            <div className="mt-2 flex items-center gap-2 text-xs text-coral-400">
              <AlertCircle className="w-4 h-4" />
              {searchError}
            </div>
          )}
        </div>

        {/* Map Container */}
        <div className="flex-1 relative">
          {!isMapReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-deep-950 z-10">
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-pacific-400 animate-spin mx-auto mb-2" />
                <p className="text-sm text-surface-soft">Loading map...</p>
              </div>
            </div>
          )}
          
          <MapContainer
            center={mapCenter}
            zoom={10}
            className="w-full h-full"
            style={{ background: '#0c1222' }}
            whenReady={() => setIsMapReady(true)}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <LocationMarker position={position} setPosition={handlePositionChange} />
            <MapController center={mapCenter} />
          </MapContainer>

          {/* Coordinates Display Overlay */}
          {position && (
            <div className="absolute top-4 left-4 right-4 bg-deep-950/90 backdrop-blur border border-white/10 rounded-lg p-3 shadow-xl">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-pacific-500/20">
                  {isReverseGeocoding ? (
                    <Loader2 className="w-4 h-4 text-pacific-400 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-pacific-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {isReverseGeocoding ? 'Locating...' : (placeName || 'Selected Location')}
                  </p>
                  <p className="text-xs text-surface-soft mt-0.5 font-mono">
                    {position[0].toFixed(6)}, {position[1].toFixed(6)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Instruction Overlay */}
          {!position && isMapReady && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-deep-950/90 backdrop-blur border border-white/10 rounded-lg p-4 shadow-xl pointer-events-none">
              <p className="text-sm text-white text-center">
                👆 Click anywhere on the map to select a location
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-deep-900/50 flex items-center justify-between">
          <div className="text-xs text-surface-soft">
            {position ? (
              <span>✓ Location selected</span>
            ) : (
              <span>No location selected yet</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={onCancel} variant="secondary" size="md">
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              variant="primary"
              size="md"
              disabled={!position}
              leftIcon={<CheckCircle2 className="w-4 h-4" />}
            >
              Confirm Location
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

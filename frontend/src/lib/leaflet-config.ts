'use client';

// Fix for default markers in Next.js
export const configureLeafletIcons = () => {
  // Only run on client side
  if (typeof window === 'undefined') return;

  const L = require('leaflet');

  // Delete the default icon to prevent conflicts
  delete (L.Icon.Default.prototype as any)._getIconUrl;

  // Set up custom icons using emoji or create simple colored markers
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: '',
    iconUrl: '',
    shadowUrl: '',
    iconSize: [25, 25],
    iconAnchor: [12, 25],
    popupAnchor: [1, -25],
  });
};

// Create custom marker icons for different hazard types
export const createHazardIcon = (hazardType: string): any => {
  // Only run on client side
  if (typeof window === 'undefined') return null;

  const L = require('leaflet');

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

  const color = getHazardColor(hazardType);
  const emoji = getHazardIcon(hazardType);

  return L.divIcon({
    html: `
      <div style="
        background-color: ${color};
        color: white;
        border-radius: 50%;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        border: 2px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      ">
        ${emoji}
      </div>
    `,
    className: 'custom-hazard-marker',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30],
  });
};

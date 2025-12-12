import type { DivIcon, Icon, IconOptions } from 'leaflet';

let leaflet: typeof import('leaflet') | null = null;
let iconsConfigured = false;

const ensureLeaflet = (): (typeof import('leaflet')) | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!leaflet) {
    // `require` keeps Leaflet out of the server bundle until we are on the client.
    leaflet = require('leaflet');
  }

  if (!iconsConfigured && leaflet) {
    delete (leaflet.Icon.Default.prototype as any)._getIconUrl;
    leaflet.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    });
    iconsConfigured = true;
  }

  return leaflet;
};

export const createCustomIcon = (hazardType: string): DivIcon | Icon<IconOptions> | undefined => {
  const L = ensureLeaflet();
  if (!L) return undefined;

  const colors: Record<string, string> = {
    flood: '#3b82f6',
    cyclone: '#8b5cf6',
    drought: '#eab308',
    earthquake: '#ef4444',
    tsunami: '#06b6d4',
    landslide: '#f97316',
    wildfire: '#dc2626',
  };

  const color = colors[hazardType] || '#6b7280';
  
  return L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div style="
        background-color: ${color};
        width: 25px;
        height: 25px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
      ">
        ${getHazardEmoji(hazardType)}
      </div>
    `,
    iconSize: [25, 25],
    iconAnchor: [12.5, 12.5],
  });
};

const getHazardEmoji = (hazard: string) => {
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

/**
 * Hazard and Impact Type Taxonomies
 */

import { HazardType, ImpactType } from './scientific-report-types';

// Extended Hazard Taxonomy (30+ types across 5 categories)
export const HAZARD_HIERARCHY: Record<string, HazardType[]> = {
  Geological: [
    {
      id: 'earthquake',
      label: 'Earthquake',
      category: 'Geological',
      icon: '🌍',
    },
    {
      id: 'volcano',
      label: 'Volcanic Eruption',
      category: 'Geological',
      icon: '🌋',
    },
    { id: 'landslide', label: 'Landslide', category: 'Geological', icon: '⛰️' },
    { id: 'tsunami', label: 'Tsunami', category: 'Geological', icon: '🌊' },
    {
      id: 'subsidence',
      label: 'Land Subsidence',
      category: 'Geological',
      icon: '📉',
    },
    { id: 'rockfall', label: 'Rockfall', category: 'Geological', icon: '🪨' },
    { id: 'avalanche', label: 'Avalanche', category: 'Geological', icon: '❄️' },
  ],

  Hydrological: [
    { id: 'flood', label: 'Flooding', category: 'Hydrological', icon: '🌊' },
    {
      id: 'flash-flood',
      label: 'Flash Flood',
      category: 'Hydrological',
      icon: '⚡🌊',
    },
    {
      id: 'coastal-flood',
      label: 'Coastal Flooding',
      category: 'Hydrological',
      icon: '🏖️',
    },
    {
      id: 'storm-surge',
      label: 'Storm Surge',
      category: 'Hydrological',
      icon: '🌀',
    },
    { id: 'drought', label: 'Drought', category: 'Hydrological', icon: '🏜️' },
    {
      id: 'extreme-precipitation',
      label: 'Extreme Precipitation',
      category: 'Hydrological',
      icon: '🌧️',
    },
    {
      id: 'water-scarcity',
      label: 'Water Scarcity',
      category: 'Hydrological',
      icon: '💧',
    },
  ],

  'Marine & Coastal': [
    {
      id: 'sea-level-rise',
      label: 'Sea Level Rise',
      category: 'Marine & Coastal',
      icon: '📈🌊',
    },
    {
      id: 'coastal-erosion',
      label: 'Coastal Erosion',
      category: 'Marine & Coastal',
      icon: '🏖️',
    },
    {
      id: 'king-tide',
      label: 'King Tide',
      category: 'Marine & Coastal',
      icon: '🌙🌊',
    },
    {
      id: 'rogue-wave',
      label: 'Rogue Wave',
      category: 'Marine & Coastal',
      icon: '🌊⚡',
    },
    {
      id: 'marine-heatwave',
      label: 'Marine Heatwave',
      category: 'Marine & Coastal',
      icon: '🌡️🌊',
    },
    {
      id: 'coral-bleaching',
      label: 'Coral Bleaching',
      category: 'Marine & Coastal',
      icon: '🪸',
    },
    {
      id: 'ocean-acidification',
      label: 'Ocean Acidification',
      category: 'Marine & Coastal',
      icon: '🧪🌊',
    },
    {
      id: 'harmful-algal-bloom',
      label: 'Harmful Algal Bloom',
      category: 'Marine & Coastal',
      icon: '🦠🌊',
    },
    {
      id: 'storm-surge',
      label: 'Storm Surge',
      category: 'Marine & Coastal',
      icon: '🌀🌊',
    },
  ],

  Meteorological: [
    {
      id: 'hurricane',
      label: 'Hurricane/Typhoon',
      category: 'Meteorological',
      icon: '🌀',
    },
    { id: 'tornado', label: 'Tornado', category: 'Meteorological', icon: '🌪️' },
    {
      id: 'severe-wind',
      label: 'Severe Wind',
      category: 'Meteorological',
      icon: '💨',
    },
    { id: 'hail', label: 'Hail', category: 'Meteorological', icon: '❄️' },
    {
      id: 'extreme-heat',
      label: 'Extreme Heat',
      category: 'Meteorological',
      icon: '🔥',
    },
    {
      id: 'extreme-cold',
      label: 'Extreme Cold',
      category: 'Meteorological',
      icon: '❄️',
    },
    { id: 'frost', label: 'Frost', category: 'Meteorological', icon: '🧊' },
    {
      id: 'lightning',
      label: 'Lightning Strike',
      category: 'Meteorological',
      icon: '⚡',
    },
  ],

  Biological: [
    {
      id: 'epidemic',
      label: 'Epidemic/Pandemic',
      category: 'Biological',
      icon: '🦠',
    },
    {
      id: 'insect-infestation',
      label: 'Insect Infestation',
      category: 'Biological',
      icon: '🦗',
    },
    {
      id: 'plant-disease',
      label: 'Plant Disease',
      category: 'Biological',
      icon: '🌱',
    },
    {
      id: 'animal-attack',
      label: 'Animal Attack',
      category: 'Biological',
      icon: '🐾',
    },
    {
      id: 'algal-bloom',
      label: 'Algal Bloom',
      category: 'Biological',
      icon: '🦠',
    },
    { id: 'wildfire', label: 'Wildfire', category: 'Biological', icon: '🔥' },
  ],

  Anthropogenic: [
    {
      id: 'industrial-accident',
      label: 'Industrial Accident',
      category: 'Anthropogenic',
      icon: '🏭',
    },
    {
      id: 'chemical-spill',
      label: 'Chemical Spill',
      category: 'Anthropogenic',
      icon: '⚠️',
    },
    {
      id: 'oil-spill',
      label: 'Oil Spill',
      category: 'Anthropogenic',
      icon: '🛢️',
    },
    {
      id: 'air-pollution',
      label: 'Air Pollution',
      category: 'Anthropogenic',
      icon: '💨',
    },
    {
      id: 'water-pollution',
      label: 'Water Pollution',
      category: 'Anthropogenic',
      icon: '🌊',
    },
    {
      id: 'soil-contamination',
      label: 'Soil Contamination',
      category: 'Anthropogenic',
      icon: '🌍',
    },
    {
      id: 'radiation-accident',
      label: 'Radiation Accident',
      category: 'Anthropogenic',
      icon: '☢️',
    },
    {
      id: 'conflict',
      label: 'Armed Conflict',
      category: 'Anthropogenic',
      icon: '⚔️',
    },
  ],
};

// Flatten hazard list for easier searching
export const HAZARD_LIST: HazardType[] = Object.values(HAZARD_HIERARCHY).flat();

// Get hazard by ID
export const getHazardById = (id: string): HazardType | undefined => {
  return HAZARD_LIST.find((h) => h.id === id);
};

// Get hazards by category
export const getHazardsByCategory = (category: string): HazardType[] => {
  return HAZARD_HIERARCHY[category] || [];
};

// Get all hazard categories
export const getHazardCategories = (): string[] => {
  return Object.keys(HAZARD_HIERARCHY);
};

// Impact Type Taxonomy (20+ types across 5 categories)
export const IMPACT_TAXONOMY: Record<string, ImpactType[]> = {
  'Human Impact': [
    {
      id: 'casualties',
      label: 'Casualties',
      category: 'Human Impact',
      unit: 'people',
    },
    {
      id: 'injuries',
      label: 'Injuries',
      category: 'Human Impact',
      unit: 'people',
    },
    {
      id: 'missing-persons',
      label: 'Missing Persons',
      category: 'Human Impact',
      unit: 'people',
    },
    {
      id: 'displacement',
      label: 'Displacement',
      category: 'Human Impact',
      unit: 'people',
    },
    {
      id: 'psychological-trauma',
      label: 'Psychological Trauma',
      category: 'Human Impact',
      unit: 'people',
    },
    {
      id: 'disease-outbreak',
      label: 'Disease Outbreak',
      category: 'Human Impact',
      unit: 'cases',
    },
    {
      id: 'malnutrition',
      label: 'Malnutrition',
      category: 'Human Impact',
      unit: 'people',
    },
  ],

  'Infrastructure Impact': [
    {
      id: 'buildings-damaged',
      label: 'Buildings Damaged',
      category: 'Infrastructure Impact',
      unit: 'buildings',
    },
    {
      id: 'buildings-destroyed',
      label: 'Buildings Destroyed',
      category: 'Infrastructure Impact',
      unit: 'buildings',
    },
    {
      id: 'roads-damaged',
      label: 'Roads Damaged',
      category: 'Infrastructure Impact',
      unit: 'km',
    },
    {
      id: 'power-outage',
      label: 'Power Outage',
      category: 'Infrastructure Impact',
      unit: 'people',
    },
    {
      id: 'water-supply-disruption',
      label: 'Water Supply Disruption',
      category: 'Infrastructure Impact',
      unit: 'people',
    },
    {
      id: 'communications-loss',
      label: 'Communications Loss',
      category: 'Infrastructure Impact',
      unit: 'people',
    },
    {
      id: 'healthcare-disruption',
      label: 'Healthcare Facility Disruption',
      category: 'Infrastructure Impact',
      unit: 'facilities',
    },
  ],

  'Economic Impact': [
    {
      id: 'direct-economic-loss',
      label: 'Direct Economic Loss',
      category: 'Economic Impact',
      unit: 'USD',
    },
    {
      id: 'indirect-economic-loss',
      label: 'Indirect Economic Loss',
      category: 'Economic Impact',
      unit: 'USD',
    },
    {
      id: 'insured-loss',
      label: 'Insured Loss',
      category: 'Economic Impact',
      unit: 'USD',
    },
    {
      id: 'agricultural-loss',
      label: 'Agricultural Loss',
      category: 'Economic Impact',
      unit: 'USD',
    },
    {
      id: 'business-interruption',
      label: 'Business Interruption',
      category: 'Economic Impact',
      unit: 'USD',
    },
    {
      id: 'unemployment-increase',
      label: 'Unemployment Increase',
      category: 'Economic Impact',
      unit: 'people',
    },
  ],

  'Environmental Impact': [
    {
      id: 'habitat-loss',
      label: 'Habitat Loss',
      category: 'Environmental Impact',
      unit: 'km²',
    },
    {
      id: 'species-endangered',
      label: 'Species Endangered',
      category: 'Environmental Impact',
      unit: 'species',
    },
    {
      id: 'forest-loss',
      label: 'Forest Loss',
      category: 'Environmental Impact',
      unit: 'km²',
    },
    {
      id: 'coastal-erosion',
      label: 'Coastal Erosion',
      category: 'Environmental Impact',
      unit: 'km',
    },
    {
      id: 'water-pollution',
      label: 'Water Pollution',
      category: 'Environmental Impact',
      unit: 'km²',
    },
    {
      id: 'air-quality-degradation',
      label: 'Air Quality Degradation',
      category: 'Environmental Impact',
      unit: 'AQI',
    },
    {
      id: 'soil-degradation',
      label: 'Soil Degradation',
      category: 'Environmental Impact',
      unit: 'km²',
    },
    {
      id: 'greenhouse-gas-increase',
      label: 'Greenhouse Gas Increase',
      category: 'Environmental Impact',
      unit: 'tons CO2e',
    },
  ],

  Recovery: [
    {
      id: 'recovery-time',
      label: 'Recovery Time',
      category: 'Recovery',
      unit: 'months',
    },
    {
      id: 'recovery-cost',
      label: 'Recovery Cost',
      category: 'Recovery',
      unit: 'USD',
    },
    {
      id: 'livelihood-restoration',
      label: 'Livelihood Restoration',
      category: 'Recovery',
      unit: 'people',
    },
    {
      id: 'ecosystem-recovery',
      label: 'Ecosystem Recovery',
      category: 'Recovery',
      unit: 'km²',
    },
  ],
};

// Flatten impact list for easier searching
export const IMPACT_LIST: ImpactType[] = Object.values(IMPACT_TAXONOMY).flat();

// Get impact by ID
export const getImpactById = (id: string): ImpactType | undefined => {
  return IMPACT_LIST.find((i) => i.id === id);
};

// Get impacts by category
export const getImpactsByCategory = (category: string): ImpactType[] => {
  return IMPACT_TAXONOMY[category] || [];
};

// Get all impact categories
export const getImpactCategories = (): string[] => {
  return Object.keys(IMPACT_TAXONOMY);
};

// Helper to map hazard IDs to labels
export const hazardIdToLabel = (id: string): string => {
  return getHazardById(id)?.label || id;
};

// Helper to map impact IDs to labels
export const impactIdToLabel = (id: string): string => {
  return getImpactById(id)?.label || id;
};

// Search hazards
export const searchHazards = (query: string): HazardType[] => {
  const lowerQuery = query.toLowerCase();
  return HAZARD_LIST.filter(
    (h) =>
      h.label.toLowerCase().includes(lowerQuery) ||
      h.id.toLowerCase().includes(lowerQuery) ||
      (h.description && h.description.toLowerCase().includes(lowerQuery))
  );
};

// Search impacts
export const searchImpacts = (query: string): ImpactType[] => {
  const lowerQuery = query.toLowerCase();
  return IMPACT_LIST.filter(
    (i) =>
      i.label.toLowerCase().includes(lowerQuery) ||
      i.id.toLowerCase().includes(lowerQuery) ||
      (i.description && i.description.toLowerCase().includes(lowerQuery))
  );
};

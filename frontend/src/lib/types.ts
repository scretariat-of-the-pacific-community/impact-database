// API Response Types for Ocean Portal

// Vocabulary Types
export interface VocabularyItem {
  id: string;
  label: string;
}

export interface VocabulariesResponse {
  hazard_types: VocabularyItem[];
  source_agencies: VocabularyItem[];
  topic_categories: VocabularyItem[];
}

export interface ImageMetadata {
  id: string;
  filename: string;
  title: string;
  abstract: string;
  object_key: string;
  bucket_name: string;
  resource_locator: string;
  upload_date: string;
  file_size: number;
  thumbnail_url?: string;
  
  // Geographic information
  latitude?: number;
  longitude?: number;
  geographic_element?: GeographicBoundingBox;
  
  // Classification
  hazard_type: HazardType;
  source_agency: SourceAgency;
  topic_category: TopicCategory[];
  keywords: string[];
  
  // ISO 19115 metadata
  file_identifier: string;
  language: string;
  character_set: string;
  hierarchy_level: string;
  contact: ResponsibleParty;
  date_stamp: string;
  
  // Additional metadata
  purpose?: string;
  spatial_resolution?: string;
  reference_system_info: string;
  format_name: string;
  format_version?: string;
  
  // Rights and constraints
  access_constraints?: string;
  use_constraints?: string;
  classification?: string;
  
  // Technical metadata
  camera_info?: CameraInfo;
  processing_level?: string;
}

export interface GeographicBoundingBox {
  west_bound_longitude: number;
  east_bound_longitude: number;
  south_bound_latitude: number;
  north_bound_latitude: number;
}

export interface ResponsibleParty {
  individual_name?: string;
  organisation_name?: string;
  position_name?: string;
  role: string;
  contact_info?: ContactInfo;
}

export interface ContactInfo {
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
}

export interface CameraInfo {
  make?: string;
  model?: string;
  lens?: string;
  focal_length?: string;
  aperture?: string;
  shutter_speed?: string;
  iso?: string;
}

// Enums
export type HazardType = 
  | 'earthquake'
  | 'flood' 
  | 'tsunami'
  | 'hurricane'
  | 'cyclone'
  | 'tornado'
  | 'wildfire'
  | 'drought'
  | 'landslide'
  | 'volcanicEruption'
  | 'avalanche'
  | 'hailstorm'
  | 'stormSurge'
  | 'extremeTemperature'
  | 'other';

export type SourceAgency = 
  | 'usgs'
  | 'noaa'
  | 'nasa'
  | 'fema'
  | 'unOcha'
  | 'who'
  | 'wmo'
  | 'ifrc'
  | 'academic'
  | 'ngo'
  | 'government'
  | 'private'
  | 'citizen'
  | 'other';

export type TopicCategory = 
  | 'farming'
  | 'biota'
  | 'boundaries'
  | 'climatologyMeteorologyAtmosphere'
  | 'economy'
  | 'elevation'
  | 'environment'
  | 'geoscientificInformation'
  | 'health'
  | 'imageryBaseMapsEarthCover'
  | 'intelligenceMilitary'
  | 'inlandWaters'
  | 'location'
  | 'oceans'
  | 'planningCadastre'
  | 'society'
  | 'structure'
  | 'transportation'
  | 'utilitiesCommunication';

// Search and Filter Types
export interface SearchFilters {
  q?: string; // Free text search
  hazard_type?: HazardType[];
  source_agency?: SourceAgency[];
  topic_category?: TopicCategory[];
  
  // Geographic filters
  bbox?: BoundingBox;
  country?: string[];
  eez?: string[]; // Exclusive Economic Zone
  
  // Temporal filters
  date_from?: string;
  date_to?: string;
  upload_date_from?: string;
  upload_date_to?: string;
  
  // Technical filters
  min_resolution?: number;
  max_file_size?: number;
  format?: string[];
  
  // Pagination
  page?: number;
  limit?: number;
  sort_by?: 'relevance' | 'date' | 'upload_date' | 'title';
  sort_order?: 'asc' | 'desc';
}

export interface BoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface SearchResponse {
  images: ImageMetadata[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  facets?: SearchFacets;
}

export interface SearchFacets {
  hazard_types: FacetCount[];
  source_agencies: FacetCount[];
  topic_categories: FacetCount[];
  countries: FacetCount[];
  formats: FacetCount[];
}

export interface FacetCount {
  value: string;
  count: number;
  label?: string;
}

// User and Authentication Types
export interface User {
  id: string;
  email: string;
  name?: string;
  roles: UserRole[];
  organization?: string;
  country?: string;
  created_at: string;
  last_login?: string;
}

export type UserRole = 'viewer' | 'contributor' | 'editor' | 'admin';

export interface AuthSession {
  user: User;
  access_token: string;
  refresh_token?: string;
  expires_at: number;
}

// UI State Types
export interface MapViewState {
  center: [number, number];
  zoom: number;
  bounds?: BoundingBox;
}

export interface UIState {
  sidebarOpen: boolean;
  filtersOpen: boolean;
  selectedImage?: ImageMetadata;
  mapView: MapViewState;
  viewMode: 'grid' | 'list' | 'map';
}

// API Error Types
export interface APIError {
  error: string;
  message: string;
  status: number;
  details?: Record<string, any>;
}

// Constants
export const HAZARD_TYPE_LABELS: Record<HazardType, string> = {
  earthquake: 'Earthquake',
  flood: 'Flood',
  tsunami: 'Tsunami',
  hurricane: 'Hurricane',
  cyclone: 'Cyclone',
  tornado: 'Tornado',
  wildfire: 'Wildfire',
  drought: 'Drought',
  landslide: 'Landslide',
  volcanicEruption: 'Volcanic Eruption',
  avalanche: 'Avalanche',
  hailstorm: 'Hailstorm',
  stormSurge: 'Storm Surge',
  extremeTemperature: 'Extreme Temperature',
  other: 'Other'
};

export const SOURCE_AGENCY_LABELS: Record<SourceAgency, string> = {
  usgs: 'USGS',
  noaa: 'NOAA',
  nasa: 'NASA',
  fema: 'FEMA',
  unOcha: 'UN OCHA',
  who: 'WHO',
  wmo: 'WMO',
  ifrc: 'IFRC',
  academic: 'Academic',
  ngo: 'NGO',
  government: 'Government',
  private: 'Private',
  citizen: 'Citizen',
  other: 'Other'
};

export const TOPIC_CATEGORY_LABELS: Record<TopicCategory, string> = {
  farming: 'Farming',
  biota: 'Biota',
  boundaries: 'Boundaries',
  climatologyMeteorologyAtmosphere: 'Climatology/Meteorology/Atmosphere',
  economy: 'Economy',
  elevation: 'Elevation',
  environment: 'Environment',
  geoscientificInformation: 'Geoscientific Information',
  health: 'Health',
  imageryBaseMapsEarthCover: 'Imagery/Base Maps/Earth Cover',
  intelligenceMilitary: 'Intelligence/Military',
  inlandWaters: 'Inland Waters',
  location: 'Location',
  oceans: 'Oceans',
  planningCadastre: 'Planning/Cadastre',
  society: 'Society',
  structure: 'Structure',
  transportation: 'Transportation',
  utilitiesCommunication: 'Utilities/Communication'
};

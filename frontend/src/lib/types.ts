// API Response Types for Pacific Impact Atlas

// Vocabulary Types
export interface VocabularyItem {
  id: string;
  label: string;
  description?: string;
}

export interface VocabulariesResponse {
  hazard_types: VocabularyItem[];
  countries: VocabularyItem[];
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
  file_size?: number;
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
  | 'cyclone'
  | 'drought'
  | 'landslide'
  | 'wildfire'
  | 'volcanic'
  | 'coastal_erosion'
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
  cyclone: 'Cyclone',
  drought: 'Drought',
  landslide: 'Landslide',
  wildfire: 'Wildfire',
  volcanic: 'Volcanic Activity',
  coastal_erosion: 'Coastal Erosion',
  other: 'Other'
};

export const HAZARD_TYPES = [
  { value: 'earthquake', label: 'Earthquake' },
  { value: 'flood', label: 'Flood' },
  { value: 'tsunami', label: 'Tsunami' },
  { value: 'cyclone', label: 'Cyclone' },
  { value: 'drought', label: 'Drought' },
  { value: 'landslide', label: 'Landslide' },
  { value: 'wildfire', label: 'Wildfire' },
  { value: 'volcanic', label: 'Volcanic Activity' },
  { value: 'coastal_erosion', label: 'Coastal Erosion' },
  { value: 'other', label: 'Other' },
] as const;

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

// User Profile Types
export interface UserStats {
  name: string;
  email: string;
  organization?: string;
  avatar_url?: string;
  total_uploads: number;
  approval_rate: number;
  impact_score: number;
  last_active: string;
  achievements: Array<{
    id: string;
    title: string;
    description: string;
    icon: string;
    unlocked?: boolean;
    unlocked_at?: string;
    tier?: string;
    points?: number;
    progress?: number;
    total?: number;
    category?: string;
  }>;
  analytics: {
    uploads_this_month: number;
    average_review_time: number;
    top_hazard: string;
    hazard_distribution?: Record<string, number>;
    contribution_heatmap?: Record<string, number>;
  };
}

export type UserActivityType = 'upload' | 'edit' | 'review' | 'achievement' | 'system';

export interface PaginationMetadata {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface PaginatedResponse<T> {
  events: T[];
  pagination: PaginationMetadata;
}

export interface UserActivityEvent {
  id: string;
  type: UserActivityType;
  title: string;
  description: string;
  timestamp: string;
  reviewer?: string;
  reviewComments?: string;
  suggestedImprovements?: { id: string; text: string }[];
  achievementBadge?: string;
  systemMessage?: string;
}

export interface UserUpload {
  id: string;
  filename: string;
  title?: string;
  hazard_type: HazardType;
  status: string;
  uploaded_at: string;
  approval_status: 'approved' | 'pending_review' | 'rejected' | 'flagged';
  thumbnail_url?: string;
  location?: string;
  country?: string;
  abstract?: string;
  keywords?: string[];
  latitude?: number;
  longitude?: number;
}

// Collaboration Types
export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type VisibilityType = 'owner' | 'workspace' | 'public';

export interface SharedFolder {
  id: string;
  name: string;
  description?: string;
  owner_username?: string; // For compatibility
  owner_id: string; // Backend uses owner_id
  workspace_id?: string;
  hazard_filter?: string;
  region_filter?: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  item_count: number;
  watch_count: number;
  watcher_count?: number; // Alias for watch_count
  is_watching?: boolean;
}

export interface CreateSharedFolderRequest {
  name: string;
  description?: string;
  workspace_id?: string;
  hazard_filter?: string;
  region_filter?: string;
  is_public?: boolean;
}

export interface SharedFolderDetail extends SharedFolder {
  items: FolderItem[];
  watchers: FolderWatcher[];
}

export interface FolderItem {
  id: string;
  folder_id: string;
  image_id: string;
  added_by: string;
  added_at: string;
  notes?: string;
  image?: ImageMetadata;
}

export interface FolderWatcher {
  id: string;
  folder_id: string;
  user_username: string;
  watched_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  owner_username: string;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
  member_count?: number;
  channel_count?: number;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_username: string;
  role: WorkspaceRole;
  joined_at: string;
}

export interface FollowedArea {
  id: string;
  user_username: string;
  entity_type: 'hazard' | 'region';
  entity_id: string;
  entity_name: string;
  followed_at: string;
  notification_enabled: boolean;
}

export interface ActivityPost {
  id: string;
  workspace_id?: string;
  author_username: string;
  content: string;
  mentions: string[];
  attachments?: string[];
  created_at: string;
  updated_at?: string;
}

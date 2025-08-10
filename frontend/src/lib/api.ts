import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for authentication
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface ImageMetadata {
  filename: string;
  hazard_type: string;
  location: string;
  country?: string;
  timestamp?: string;
  latitude?: number;
  longitude?: number;
  
  // ISO 19115 fields
  title?: string;
  title_i18n?: Record<string, string>;
  abstract?: string;
  abstract_i18n?: Record<string, string>;
  purpose?: string;
  status?: string;
  point_of_contact?: string;
  date_stamp?: string;
  maintenance_frequency?: string;
  
  geographic_bounding_box?: any;
  geographic_identifier?: string;
  temporal_extent_start?: string;
  temporal_extent_end?: string;
  vertical_extent?: number;
  
  topic_category?: string[];
  keywords?: string[];
  keywords_i18n?: Record<string, string[]>;
  keyword_thesaurus?: string;
  
  resource_locator?: string;
  format_name?: string;
  format_version?: string;
  
  lineage_statement?: string;
  source?: string;
  positional_accuracy?: number;
  
  use_constraints?: string;
  access_constraints?: string;
  security_classification?: string;
  
  metadata_language?: string;
  metadata_standard_name?: string;
  metadata_standard_version?: string;
  metadata_date?: string;
}

export const imageApi = {
  getAll: () => apiClient.get<ImageMetadata[]>('/images'),
  getById: (filename: string) => apiClient.get<ImageMetadata>(`/images/${filename}`),
  getByHazard: (hazardType: string) => apiClient.get<ImageMetadata[]>(`/hazards/${hazardType}`),
  upload: (formData: FormData) => apiClient.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getGeoJSON: () => apiClient.get('/geojson'),
  getMetadata: (filename: string) => {
    return axios.get(`/images/${encodeURIComponent(filename)}/metadata`);
  },
};
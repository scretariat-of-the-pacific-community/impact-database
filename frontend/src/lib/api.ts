import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { 
  SearchFilters, 
  SearchResponse, 
  ImageMetadata, 
  User,
  APIError,
  BoundingBox 
} from './types';

class APIClient {
  private client: AxiosInstance;
  private baseURL: string;

  constructor() {
    this.baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = this.getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          this.handleUnauthorized();
        }
        return Promise.reject(this.formatError(error));
      }
    );
  }

  private getAuthToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('authToken');
    }
    return null;
  }

  private handleUnauthorized(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('authToken');
      window.location.href = '/auth/login';
    }
  }

  private formatError(error: any): APIError {
    const defaultError: APIError = {
      error: 'Unknown Error',
      message: 'An unexpected error occurred',
      status: 500,
    };

    if (error.response) {
      return {
        error: error.response.data?.error || 'API Error',
        message: error.response.data?.message || error.response.statusText,
        status: error.response.status,
        details: error.response.data?.details,
      };
    }

    if (error.request) {
      return {
        ...defaultError,
        error: 'Network Error',
        message: 'Unable to connect to the server',
      };
    }

    return {
      ...defaultError,
      message: error.message || defaultError.message,
    };
  }

  // Search and Browse Images
  async searchImages(filters: SearchFilters = {}): Promise<SearchResponse> {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(v => params.append(key, v.toString()));
        } else if (typeof value === 'object' && 'west' in value) {
          params.append('bbox', `${value.west},${value.south},${value.east},${value.north}`);
        } else {
          params.append(key, value.toString());
        }
      }
    });

    const response: AxiosResponse<SearchResponse> = await this.client.get(
      `/api/v1/images/search?${params.toString()}`
    );
    return response.data;
  }

  async getImage(id: string): Promise<ImageMetadata> {
    const response: AxiosResponse<ImageMetadata> = await this.client.get(`/upload/images/${id}`);
    return response.data;
  }

  async getImagesInBounds(bounds: BoundingBox): Promise<ImageMetadata[]> {
    const bbox = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
    const response: AxiosResponse<ImageMetadata[]> = await this.client.get(
      `/api/v1/images/bounds?bbox=${bbox}`
    );
    return response.data;
  }

  async getHazardTypeSummary(): Promise<Array<{hazard_type: string; count: number}>> {
    const response = await this.client.get('/hazards');
    return response.data;
  }

  async getGeoJSON(): Promise<any> {
    const response = await this.client.get('/geojson');
    return response.data;
  }

  async getCurrentUser(): Promise<User> {
    const response: AxiosResponse<User> = await this.client.get('/auth/me');
    return response.data;
  }

  async healthCheck(): Promise<{status: string}> {
    const response = await this.client.get('/health');
    return response.data;
  }
}

// Legacy compatibility
export const apiClient = new APIClient()['client'];

// New Ocean Portal API
export const oceanPortalApi = new APIClient();

// Legacy image API for backward compatibility
export const imageApi = {
  getAll: () => apiClient.get<ImageMetadata[]>('/images'),
  getById: (filename: string) => oceanPortalApi.getImage(filename),
  getByHazard: (hazardType: string) => apiClient.get('/hazards', { params: { type: hazardType } }),
  upload: (formData: FormData) => apiClient.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getGeoJSON: () => apiClient.get('/geojson'),
  getMetadata: (filename: string) => {
    return apiClient.get(`/images/${encodeURIComponent(filename)}/metadata`);
  },
  vocabularies: () => apiClient.get('/vocabularies'),
  search: (filters: SearchFilters) => oceanPortalApi.searchImages(filters),
};

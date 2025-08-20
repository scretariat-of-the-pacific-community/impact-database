import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { 
  SearchFilters, 
  SearchResponse, 
  ImageMetadata, 
  User,
  APIError,
  BoundingBox,
  VocabulariesResponse 
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
    const response: AxiosResponse<ImageMetadata> = await this.client.get(`/upload/images/${id}/metadata`);
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

  async getVocabularies(): Promise<VocabulariesResponse> {
    const response: AxiosResponse<VocabulariesResponse> = await this.client.get('/api/vocabularies');
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

  // Admin API Methods
  async getDashboardStats(period: string = '7d'): Promise<any> {
    const response = await this.client.get(`/api/admin/dashboard?period=${period}`);
    return response.data;
  }

  async getCurationQueue(params: any = {}): Promise<any> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) queryParams.append(key, value.toString());
    });
    const response = await this.client.get(`/api/admin/curation/queue?${queryParams}`);
    return response.data;
  }

  async getCurationItem(itemId: string): Promise<any> {
    const response = await this.client.get(`/api/admin/curation/queue/${itemId}`);
    return response.data;
  }

  async updateCurationStatus(itemId: string, data: any): Promise<any> {
    const response = await this.client.put(`/api/admin/curation/queue/${itemId}`, data);
    return response.data;
  }

  async getUsers(params: any = {}): Promise<any> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) queryParams.append(key, value.toString());
    });
    const response = await this.client.get(`/api/admin/users?${queryParams}`);
    return response.data;
  }

  async createUser(userData: any): Promise<any> {
    const response = await this.client.post('/api/admin/users', userData);
    return response.data;
  }

  async updateUser(userId: string, userData: any): Promise<any> {
    const response = await this.client.put(`/api/admin/users/${userId}`, userData);
    return response.data;
  }

  async lockUser(userId: string): Promise<any> {
    const response = await this.client.post(`/api/admin/users/${userId}/lock`);
    return response.data;
  }

  async unlockUser(userId: string): Promise<any> {
    const response = await this.client.post(`/api/admin/users/${userId}/unlock`);
    return response.data;
  }

  async deleteUser(userId: string): Promise<any> {
    const response = await this.client.delete(`/api/admin/users/${userId}`);
    return response.data;
  }

  async getRoles(): Promise<any> {
    const response = await this.client.get('/api/admin/roles');
    return response.data;
  }

  async getImportJobs(): Promise<any> {
    const response = await this.client.get('/api/admin/imports');
    return response.data;
  }

  async startImport(formData: FormData): Promise<any> {
    const response = await this.client.post('/api/admin/imports', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  }

  async getExportJobs(): Promise<any> {
    const response = await this.client.get('/api/admin/exports');
    return response.data;
  }

  async startExport(exportData: any): Promise<any> {
    const response = await this.client.post('/api/admin/exports', exportData);
    return response.data;
  }

  async getComments(itemId: string, params: any = {}): Promise<any> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) queryParams.append(key, value.toString());
    });
    const response = await this.client.get(`/api/admin/curation/comments/${itemId}?${queryParams}`);
    return response.data;
  }

  async createComment(commentData: any): Promise<any> {
    const response = await this.client.post('/api/admin/curation/comments', commentData);
    return response.data;
  }

  async updateComment(commentId: string, commentData: any): Promise<any> {
    const response = await this.client.put(`/api/admin/curation/comments/${commentId}`, commentData);
    return response.data;
  }

  async deleteComment(commentId: string): Promise<any> {
    const response = await this.client.delete(`/api/admin/curation/comments/${commentId}`);
    return response.data;
  }

  async flagComment(commentId: string, reason: string): Promise<any> {
    const response = await this.client.post(`/api/admin/curation/comments/${commentId}/flag`, { reason });
    return response.data;
  }

  async getImageMetadata(imageId: string): Promise<any> {
    const response = await this.client.get(`/api/images/${imageId}/metadata`);
    return response.data;
  }

  async updateImageMetadata(imageId: string, metadataData: any): Promise<any> {
    const response = await this.client.put(`/api/admin/curation/metadata/${imageId}`, metadataData);
    return response.data;
  }
}

// Legacy compatibility
export const apiClient = new APIClient()['client'];

// New Ocean Portal API
export const oceanPortalApi = new APIClient();

// Legacy image API for backward compatibility
export const imageApi = {
  getAll: () => apiClient.get<ImageMetadata[]>('/api/images'),
  getById: (filename: string) => oceanPortalApi.getImage(filename),
  getByHazard: (hazardType: string) => apiClient.get('/api/hazards', { params: { type: hazardType } }),
  upload: (formData: FormData) => apiClient.post('/upload/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getGeoJSON: () => apiClient.get('/api/geojson'),
  getMetadata: (filename: string) => {
    return apiClient.get(`/api/images/${encodeURIComponent(filename)}/metadata`);
  },
  vocabularies: () => oceanPortalApi.getVocabularies(),
  search: (filters: SearchFilters) => oceanPortalApi.searchImages(filters),
};

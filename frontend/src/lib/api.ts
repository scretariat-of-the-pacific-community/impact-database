import axios, { AxiosInstance, AxiosResponse, isAxiosError } from 'axios';
import {
  SearchFilters,
  SearchResponse,
  UnifiedSearchResponse,
  ImageMetadata,
  User,
  UserRole,
  APIError,
  BoundingBox,
  VocabulariesResponse,
  UserStats,
  UserUpload,
  UserActivityEvent,
  PaginatedResponse,
} from './types';
import { config, getApiUrl } from './config';

class APIClient {
  private client: AxiosInstance;
  private baseURL!: string; // Definitely assigned in constructor
  private isHandlingUnauthorized: boolean = false;

  constructor() {
    // Lazy evaluation of BASE_URL to ensure it's called in the right context
    this.baseURL =
      typeof window === 'undefined'
        ? process.env.NEXT_PUBLIC_API_URL_INTERNAL ||
          process.env.NEXT_PUBLIC_API_URL ||
          'http://api:8000'
        : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: config.API.TIMEOUT,
      withCredentials: true, // Send HttpOnly cookies with requests
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    // Note: HttpOnly cookie is sent automatically via withCredentials
    // This interceptor is for fallback to localStorage token if needed
    this.client.interceptors.request.use(
      (config) => {
        const token = this.getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        const csrfToken = this.getCsrfToken();
        if (csrfToken) {
          config.headers['X-CSRF-Token'] = csrfToken;
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
          // Don't trigger handleUnauthorized for auth check endpoint
          // The auth provider handles this case explicitly
          const requestUrl = error.config?.url || '';
          if (!requestUrl.includes('/api/rbac/auth/me')) {
            this.handleUnauthorized();
          }
        }
        return Promise.reject(this.formatError(error));
      }
    );
  }

  private getCsrfToken(): string | null {
    if (typeof document === 'undefined') return null;
    const cookie = document.cookie
      ?.split('; ')
      .find((row) => row.startsWith('csrf_token='))
      ?.split('=')[1];
    return cookie ? decodeURIComponent(cookie) : null;
  }

  private getAuthToken(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }
    const cookieToken = document.cookie
      ?.split('; ')
      .find((row) => row.startsWith('ocean_portal_token='))
      ?.split('=')[1];
    if (cookieToken) {
      return decodeURIComponent(cookieToken);
    }
    return localStorage.getItem('authToken');
  }

  private handleUnauthorized(): void {
    // Prevent multiple rapid calls from causing re-render loops
    if (this.isHandlingUnauthorized) {
      return;
    }

    if (typeof window !== 'undefined') {
      this.isHandlingUnauthorized = true;

      // Clear auth tokens
      localStorage.removeItem('authToken');
      localStorage.removeItem('ocean_portal_session');
      document.cookie =
        'ocean_portal_token=; Max-Age=0; path=/; SameSite=Strict';

      // Dispatch custom event so auth provider can react and update React state
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));

      // Only redirect to login if not already there or on public pages
      const publicPaths = [
        '/',
        '/auth/login',
        '/auth/callback',
        '/search',
        '/map',
      ];
      const currentPath = window.location.pathname;

      if (!publicPaths.includes(currentPath)) {
        window.location.href = '/auth/login';
      }

      // Reset the flag after a short delay to allow legitimate re-auth attempts
      setTimeout(() => {
        this.isHandlingUnauthorized = false;
      }, 2000);
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

    // Map frontend filters to backend parameter names
    const paramMap: Record<string, string> = {
      limit: 'limit',
      offset: 'skip', // Backend uses 'skip' instead of 'offset'
      q: 'q',
      sort_by: 'sort_by',
      sort_order: 'sort_order',
      hazard_type: 'hazard_type',
      location: 'location',
      country: 'country',
    };

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        const backendKey = paramMap[key] || key;
        if (Array.isArray(value)) {
          value.forEach((v) => params.append(backendKey, v.toString()));
        } else if (typeof value === 'object' && 'west' in value) {
          params.append(
            'bbox',
            `${value.west},${value.south},${value.east},${value.north}`
          );
        } else {
          params.append(backendKey, value.toString());
        }
      }
    });

    const response: AxiosResponse<SearchResponse> = await this.client.get(
      `/api/search?${params.toString()}`
    );
    return response.data;
  }

  async searchContent(
    filters: SearchFilters = {}
  ): Promise<UnifiedSearchResponse> {
    // Unified search that returns both images AND videos
    const params = new URLSearchParams();

    // Map frontend filter keys to backend API keys
    const paramMap: Record<string, string> = {
      q: 'q',
      hazardType: 'hazard_type',
      sourceAgency: 'source_agency',
      dateFrom: 'date_from',
      dateTo: 'date_to',
      uploadDateFrom: 'upload_date_from',
      uploadDateTo: 'upload_date_to',
      page: 'skip',
      limit: 'limit',
      sortBy: 'sort_by',
      sortOrder: 'sort_order',
      location: 'location',
      country: 'country',
    };

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        const backendKey = paramMap[key] || key;
        if (Array.isArray(value)) {
          value.forEach((v) => params.append(backendKey, v.toString()));
        } else if (key === 'page' && typeof value === 'number') {
          // Convert page number to skip value
          const skip = (value - 1) * (filters.limit || 20);
          params.append('skip', skip.toString());
        } else if (typeof value === 'object' && 'west' in value) {
          params.append(
            'bbox',
            `${value.west},${value.south},${value.east},${value.north}`
          );
        } else {
          params.append(backendKey, value.toString());
        }
      }
    });

    const response: AxiosResponse<UnifiedSearchResponse> =
      await this.client.get(`/api/images/content/search?${params.toString()}`);
    return response.data;
  }

  async getImage(id: string): Promise<ImageMetadata> {
    // Use dedicated endpoint for efficient single image lookup
    const response: AxiosResponse<ImageMetadata> = await this.client.get(
      `/api/images/${encodeURIComponent(id)}`
    );
    return response.data;
  }

  async getImageHistory(id: string): Promise<{ history: any[] }> {
    const response = await this.client.get(
      `/api/images/${encodeURIComponent(id)}/history`
    );
    return response.data;
  }

  async getImagesInBounds(bounds: BoundingBox): Promise<ImageMetadata[]> {
    const bbox = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
    // Use GeoJSON endpoint which accepts bbox parameter
    const response = await this.client.get(
      `/api/geojson?bbox=${bbox}&limit=1000`
    );
    // GeoJSON returns features array, extract properties as ImageMetadata
    const features = response.data.features || [];
    return features.map((f: any) => ({
      ...f.properties,
      latitude: f.geometry?.coordinates?.[1],
      longitude: f.geometry?.coordinates?.[0],
    }));
  }

  async getHazards(): Promise<any[]> {
    const response = await this.client.get('/api/hazards');
    return response.data;
  }

  async getGeoJSON(): Promise<any> {
    const response = await this.client.get('/api/geojson');
    return response.data;
  }

  async getVocabularies(): Promise<VocabulariesResponse> {
    const response: AxiosResponse<VocabulariesResponse> =
      await this.client.get('/api/vocabularies');
    return response.data;
  }

  async getUserStats(): Promise<UserStats> {
    try {
      const response: AxiosResponse<UserStats> =
        await this.client.get('/api/user/stats');
      return response.data;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        // Log warning - stats endpoint should exist in production
        console.warn(
          '⚠️ Stats endpoint returned 404 - using fallback data. This should not happen in production!'
        );

        // Fall back to placeholder stats when the endpoint is not available yet
        return {
          name: 'Impact Responder',
          email: 'unknown@impactdatabase.org',
          organization: 'Independent',
          total_uploads: 0,
          approval_rate: 0,
          impact_score: 0,
          last_active: new Date().toISOString(),
          achievements: [],
          analytics: {
            uploads_this_month: 0,
            average_review_time: 0,
            top_hazard: 'unknown',
          },
        };
      }
      throw error;
    }
  }

  async getUserUploads(params?: {
    page?: number;
    limit?: number;
  }): Promise<UserUpload[]> {
    try {
      const response: AxiosResponse<UserUpload[]> = await this.client.get(
        '/api/images/user/uploads',
        {
          params,
        }
      );
      return response.data;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        return [];
      }
      throw error;
    }
  }

  async getUserActivity(): Promise<PaginatedResponse<UserActivityEvent>> {
    try {
      const response: AxiosResponse<PaginatedResponse<UserActivityEvent>> =
        await this.client.get('/api/user/activity');
      return response.data;
    } catch (error) {
      if (
        isAxiosError(error) &&
        (error.response?.status === 404 || error.response?.status === 403)
      ) {
        return {
          events: [],
          pagination: {
            total: 0,
            page: 1,
            limit: 50,
            total_pages: 0,
            has_next: false,
            has_prev: false,
          },
        };
      }
      throw error;
    }
  }

  async getCurrentUser(): Promise<User> {
    // Use RBAC endpoint that includes role and permissions
    const response: AxiosResponse<any> =
      await this.client.get('/api/rbac/auth/me');
    const userData = response.data;

    // Transform role object to roles array for frontend compatibility
    const roles: UserRole[] = [];
    if (userData.role?.name) {
      roles.push(userData.role.name as UserRole);
    }

    return {
      id: userData.id,
      email: userData.email,
      name: userData.full_name,
      roles,
      organization: userData.organization,
      country: userData.country,
      created_at: userData.created_at,
      last_login: userData.last_login,
    };
  }

  async updateImage(imageId: string, data: any): Promise<any> {
    const response = await this.client.put(`/api/images/${imageId}`, data);
    return response.data;
  }

  async deleteImage(filename: string): Promise<any> {
    const response = await this.client.delete(
      `/upload/images/${encodeURIComponent(filename)}`
    );
    return response.data;
  }

  async deleteVideo(videoId: string): Promise<any> {
    const response = await this.client.delete(`/api/video/videos/${videoId}`);
    return response.data;
  }

  async checkHealth(): Promise<any> {
    const response = await this.client.get('/api/health');
    return response.data;
  }

  // Settings API Methods
  async getUserSettings(): Promise<any> {
    try {
      const response = await this.client.get('/api/user/settings');
      return response.data;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        // Return default settings if endpoint doesn't exist yet
        return {
          profile: { avatar_url: '', bio: '', location: '', organization: '' },
          privacy: {
            public_profile: true,
            hide_stats: false,
            anonymous_contributions: false,
          },
          notifications: {
            email: {
              uploads: true,
              reviews: true,
              comments: true,
              achievements: false,
            },
            in_app: {
              uploads: true,
              reviews: true,
              comments: true,
              achievements: true,
            },
            push: {
              uploads: false,
              reviews: false,
              comments: false,
              achievements: false,
            },
          },
          default_metadata: { tags: [] },
        };
      }
      throw error;
    }
  }

  async updateUserSettings(data: any): Promise<any> {
    const response = await this.client.put('/api/user/settings', data);
    return response.data;
  }

  async getStorageQuota(): Promise<any> {
    try {
      const response = await this.client.get('/api/user/storage');
      return response.data;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        // Return mock data if endpoint doesn't exist yet
        return {
          used: 0,
          total: 10 * 1024 * 1024 * 1024, // 10 GB
          by_type: { images: 0, videos: 0, documents: 0 },
        };
      }
      throw error;
    }
  }

  async getAPITokens(): Promise<any[]> {
    try {
      const response = await this.client.get('/api/user/tokens');
      return response.data;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        return [];
      }
      throw error;
    }
  }

  async generateAPIToken(name: string): Promise<any> {
    const response = await this.client.post('/api/user/tokens', { name });
    return response.data;
  }

  async deleteAPIToken(tokenId: string): Promise<void> {
    await this.client.delete(`/api/user/tokens/${tokenId}`);
  }

  async uploadAvatar(file: File): Promise<{ url: string }> {
    const formData = new FormData();
    formData.append('avatar', file);
    const response = await this.client.post('/api/user/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async exportUserData(): Promise<Blob> {
    const response = await this.client.get('/api/user/export', {
      responseType: 'blob',
    });
    return response.data;
  }

  async deleteAccount(): Promise<void> {
    await this.client.delete('/api/user/account');
  }

  // Admin API Methods
  async getDashboardStats(period: string = '7d'): Promise<any> {
    const response = await this.client.get(
      `/api/admin/curation/dashboard/stats?period=${period}`
    );
    return response.data;
  }

  async getCurationQueue(params: any = {}): Promise<any> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) queryParams.append(key, value.toString());
    });
    const response = await this.client.get(
      `/api/admin/curation/queue?${queryParams}`
    );
    return response.data;
  }

  async getCurationItem(itemId: string): Promise<any> {
    const response = await this.client.get(
      `/api/admin/curation/queue/${itemId}`
    );
    return response.data;
  }

  async updateCurationStatus(itemId: string, data: any): Promise<any> {
    const response = await this.client.put(
      `/api/admin/curation/queue/${itemId}`,
      data
    );
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
    const response = await this.client.put(
      `/api/admin/users/${userId}`,
      userData
    );
    return response.data;
  }

  async lockUser(userId: string): Promise<any> {
    const response = await this.client.post(`/api/admin/users/${userId}/lock`);
    return response.data;
  }

  async unlockUser(userId: string): Promise<any> {
    const response = await this.client.post(
      `/api/admin/users/${userId}/unlock`
    );
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
      headers: { 'Content-Type': 'multipart/form-data' },
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
    const response = await this.client.get(
      `/api/admin/curation/comments/${itemId}?${queryParams}`
    );
    return response.data;
  }

  async createComment(commentData: any): Promise<any> {
    const response = await this.client.post(
      '/api/admin/curation/comments',
      commentData
    );
    return response.data;
  }

  async updateComment(commentId: string, commentData: any): Promise<any> {
    const response = await this.client.put(
      `/api/admin/curation/comments/${commentId}`,
      commentData
    );
    return response.data;
  }

  async deleteComment(commentId: string): Promise<any> {
    const response = await this.client.delete(
      `/api/admin/curation/comments/${commentId}`
    );
    return response.data;
  }

  async flagComment(commentId: string, reason: string): Promise<any> {
    const response = await this.client.post(
      `/api/admin/curation/comments/${commentId}/flag`,
      { reason }
    );
    return response.data;
  }

  async getImageMetadata(imageId: string): Promise<any> {
    const response = await this.client.get(`/api/images/${imageId}/metadata`);
    return response.data;
  }

  async updateImageMetadata(imageId: string, metadataData: any): Promise<any> {
    const response = await this.client.put(
      `/api/admin/curation/metadata/${imageId}`,
      metadataData
    );
    return response.data;
  }
}

// Legacy compatibility
export const apiClient = new APIClient()['client'];

// Pacific Impact Atlas API
export const oceanPortalApi = new APIClient();

// Legacy image API for backward compatibility
export const imageApi = {
  getAll: () => apiClient.get<ImageMetadata[]>('/api/images/list'), // Use the new list endpoint
  getById: (filename: string) => oceanPortalApi.getImage(filename),
  getByHazard: (hazardType: string) =>
    apiClient.get('/api/hazards', { params: { type: hazardType } }),
  upload: (formData: FormData, onProgress?: (progress: number) => void) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Setup progress tracking
      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            onProgress(Math.round(percentComplete));
          }
        });
      }

      // Setup response handlers
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            resolve(xhr.responseText);
          }
        } else {
          // Try to parse error detail from API response
          let errorMessage = xhr.statusText;
          try {
            const errorData = JSON.parse(xhr.responseText);
            if (errorData.detail) {
              errorMessage =
                typeof errorData.detail === 'string'
                  ? errorData.detail
                  : JSON.stringify(errorData.detail);
            }
          } catch (e) {
            // Use status text if can't parse JSON
          }
          reject(new Error(`Upload failed: ${errorMessage}`));
        }
      };

      xhr.onerror = () => reject(new Error('Upload failed: Network error'));

      // Use cookie-based authentication (secure, XSS-proof)
      // Cookies are sent automatically with credentials, no manual Authorization header needed
      xhr.withCredentials = true;

      // Send request
      xhr.open('POST', getApiUrl('/upload/upload'));
      xhr.send(formData);
    });
  },
  getGeoJSON: () => apiClient.get('/api/geojson'),
  getMetadata: (filename: string) => {
    return apiClient.get(`/upload/images/${encodeURIComponent(filename)}`);
  },
  vocabularies: async () => {
    const response = await apiClient.get('/api/vocabularies');
    return response.data;
  },
  history: async (imageId: string) => oceanPortalApi.getImageHistory(imageId),
  userStats: () => oceanPortalApi.getUserStats(),
  userUploads: (params?: { page?: number; limit?: number }) =>
    oceanPortalApi.getUserUploads(params),
  userActivity: () => oceanPortalApi.getUserActivity(),
  userSettings: () => oceanPortalApi.getUserSettings(),
  updateSettings: (data: any) => oceanPortalApi.updateUserSettings(data),
  storageQuota: () => oceanPortalApi.getStorageQuota(),
  apiTokens: () => oceanPortalApi.getAPITokens(),
  generateToken: (name: string) => oceanPortalApi.generateAPIToken(name),
  deleteToken: (tokenId: string) => oceanPortalApi.deleteAPIToken(tokenId),
  uploadAvatar: (file: File) => oceanPortalApi.uploadAvatar(file),
  exportData: () => oceanPortalApi.exportUserData(),
  deleteAccount: () => oceanPortalApi.deleteAccount(),
  search: (filters: SearchFilters) => oceanPortalApi.searchImages(filters),
  searchContent: (filters: SearchFilters) =>
    oceanPortalApi.searchContent(filters),
  updateImage: async (imageId: string, data: any) => {
    const response = await apiClient.put(`/api/images/${imageId}`, data);
    return response.data;
  },
  deleteImage: (filename: string) => oceanPortalApi.deleteImage(filename),
  deleteVideo: (videoId: string) => oceanPortalApi.deleteVideo(videoId),
  // Featured stories API disabled - using static curated content only
  getFeaturedStories: async () => {
    // Return empty array - featured stories are now static only (Tonga, Fiji)
    return [];
  },
};

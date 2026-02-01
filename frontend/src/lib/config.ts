/**
 * Configuration settings for the frontend application
 *
 * API Architecture:
 * ================
 *
 * 1. Next.js API Routes (/api/*):
 *    - Use relative paths: '/api/admin/users', '/api/analytics'
 *    - Handled by Next.js server-side (app/api/ directory)
 *    - Work in any deployment without configuration
 *    - These routes proxy to backend using environment variables
 *
 * 2. Direct Backend API Calls:
 *    - Use imageApi from '@/lib/api'
 *    - Configured with BASE_URL from environment variables
 *    - Example: imageApi.searchImages(), imageApi.upload()
 *
 * Environment Variables:
 * - NEXT_PUBLIC_API_URL: External backend URL (browser access)
 * - NEXT_PUBLIC_API_URL_INTERNAL: Internal backend URL (SSR in Docker)
 */

// Helper to determine the correct API URL based on execution context
const getBaseApiUrl = (): string => {
  // Server-side (SSR/SSG) in Docker: use internal service name
  if (typeof window === 'undefined') {
    return (
      process.env.NEXT_PUBLIC_API_URL_INTERNAL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://api:8000'
    );
  }
  // Client-side (browser): use external URL accessible from host and allowed by CSP
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
};

const config = {
  API: {
    BASE_URL: getBaseApiUrl(),
    TIMEOUT: 30000,
  },
  UPLOAD: {
    // Image limits
    MAX_IMAGE_SIZE: 50 * 1024 * 1024, // 50MB

    // Video limits (sync with backend VideoSettings)
    MAX_VIDEO_SIZE_FREE: 2 * 1024 * 1024 * 1024, // 2GB
    MAX_VIDEO_SIZE_PREMIUM: 5 * 1024 * 1024 * 1024, // 5GB

    // Allowed file extensions
    ALLOWED_IMAGE_EXTENSIONS: [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.bmp',
      '.tiff',
      '.tif',
      '.webp',
      '.avif',
      '.heic',
      '.heif',
    ],
    ALLOWED_VIDEO_EXTENSIONS: ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'],

    // Upload chunking (increased for videos)
    CHUNK_SIZE: 5 * 1024 * 1024, // 5MB chunks for large files
    MIN_CHUNK_SIZE: 1 * 1024 * 1024, // 1MB minimum
    MAX_CHUNK_SIZE: 10 * 1024 * 1024, // 10MB maximum

    // Upload behavior
    ENABLE_RESUMABLE_UPLOADS: true,
    AUTO_RETRY_FAILED_CHUNKS: true,
    MAX_RETRY_ATTEMPTS: 3,
  },
};

export { config };

/**
 * Check if file is a video based on extension
 */
export const isVideoFile = (filename: string): boolean => {
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
  return config.UPLOAD.ALLOWED_VIDEO_EXTENSIONS.includes(ext);
};

/**
 * Check if file is an image based on extension
 */
export const isImageFile = (filename: string): boolean => {
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
  return config.UPLOAD.ALLOWED_IMAGE_EXTENSIONS.includes(ext);
};

/**
 * Get max file size based on file type and user tier
 */
export const getMaxFileSize = (
  filename: string,
  userTier: 'free' | 'premium' = 'free'
): number => {
  if (isVideoFile(filename)) {
    return userTier === 'premium'
      ? config.UPLOAD.MAX_VIDEO_SIZE_PREMIUM
      : config.UPLOAD.MAX_VIDEO_SIZE_FREE;
  }
  return config.UPLOAD.MAX_IMAGE_SIZE;
};

export const getApiUrl = (path: string): string => {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const baseUrl = getBaseApiUrl();
  // Ensure we don't have double slashes
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
};

export default config;

/**
 * Configuration settings for the frontend application
 */

const config = {
  API: {
    BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    TIMEOUT: 30000,
  },
  UPLOAD: {
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    ALLOWED_EXTENSIONS: [
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', 
      '.webp', '.avif', '.heic', '.heif'
    ],
    CHUNK_SIZE: 1024 * 1024, // 1MB chunks for large uploads
  },
};

export { config };

export const getApiUrl = (path: string): string => {
  const baseUrl = config.API.BASE_URL.replace(/\/$/, ''); // Remove trailing slash
  const cleanPath = path.replace(/^\//, ''); // Remove leading slash
  return `${baseUrl}/${cleanPath}`;
};

export default config;
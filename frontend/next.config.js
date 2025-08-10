/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts',
        expiration: {
          maxEntries: 4,
          maxAgeSeconds: 365 * 24 * 60 * 60 // 365 days
        }
      }
    },
    {
      urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts-static',
        expiration: {
          maxEntries: 4,
          maxAgeSeconds: 365 * 24 * 60 * 60 // 365 days
        }
      }
    },
    {
      urlPattern: /\.(?:js|css|woff|woff2|ttf|eot)$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-resources',
        expiration: {
          maxEntries: 60,
          maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
        }
      }
    },
    {
      urlPattern: /\/api\/images$/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-images-list',
        expiration: {
          maxEntries: 10,
          maxAgeSeconds: 5 * 60 // 5 minutes
        },
        networkTimeoutSeconds: 10
      }
    },
    {
      urlPattern: /\/api\/images\/.*\.(jpg|jpeg|png|gif|webp)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'image-cache',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 24 * 60 * 60 // 24 hours
        }
      }
    },
    {
      urlPattern: /\/api\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 5 * 60 // 5 minutes
        },
        networkTimeoutSeconds: 10
      }
    }
  ],
  fallbacks: {
    image: '/placeholder-image.svg',
    document: '/offline',
    font: 'https://fonts.gstatic.com/s/roboto/v27/KFOmCnqEu92Fr1Mu4mxKKTU1Kg.woff2'
  }
});

const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api`,
  },
  images: {
    domains: ['localhost', '127.0.0.1', '0.0.0.0'],
    unoptimized: true
  },
  // Fix cross-origin warnings in development
  allowedDevOrigins: ['127.0.0.1'],
  // Enable strict mode for better performance
  reactStrictMode: true,
};

module.exports = withPWA(nextConfig);

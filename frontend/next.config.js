/** @type {import('next').NextConfig} */
// Custom service worker + manifest handle PWA concerns (see public/sw.js / manifest.json).

const { withSentryConfig } = require('@sentry/nextjs');
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const getApiOrigin = () => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return '';
  try {
    const { origin } = new URL(apiUrl);
    return origin;
  } catch {
    return '';
  }
};

const createCSP = () => {
  const apiOrigin = getApiOrigin();
  const sources = {
    imgSrc: ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'],
    connectSrc: ["'self'", apiOrigin, 'https://*.sentry.io', 'https://*.ingest.sentry.io', 'https://vitals.vercel-insights.com'],
  };
  if (apiOrigin) {
    sources.imgSrc.push(apiOrigin);
    sources.connectSrc.push(apiOrigin);
  }
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src ${sources.imgSrc.join(' ')}`,
    `connect-src ${sources.connectSrc.join(' ')}`,
    "form-action 'self'",
    "media-src 'self' blob: data:",
  ]
    .filter(Boolean)
    .join('; ');
  return csp.replace(/\s{2,}/g, ' ').trim();
};

const securityHeaders = () => {
  const headers = [
    {
      key: 'Content-Security-Policy',
      value: createCSP(),
    },
    {
      key: 'Referrer-Policy',
      value: 'strict-origin-when-cross-origin',
    },
    {
      key: 'X-Content-Type-Options',
      value: 'nosniff',
    },
    {
      key: 'X-Frame-Options',
      value: 'DENY',
    },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    },
  ];
  if (process.env.NODE_ENV === 'production') {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    });
  }
  return headers;
};

const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  },
  images: {
    domains: ['localhost', '127.0.0.1', '0.0.0.0'],
    unoptimized: true
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  // Fix cross-origin warnings in development
  allowedDevOrigins: ['127.0.0.1'],
  // Enable strict mode for better performance
  reactStrictMode: true,
  // Improve Fast Refresh performance
  experimental: {
    optimizeCss: false, // Disable CSS optimization in development
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders(),
      },
    ];
  },
};

const configWithPlugins = withBundleAnalyzer(nextConfig);

// Disable Sentry wrapper in development to prevent crashes
module.exports = process.env.NODE_ENV === 'development' 
  ? configWithPlugins
  : withSentryConfig(
      configWithPlugins,
      {
        silent: true,
        widenClientFileUpload: true,
        tunnelRoute: '/monitoring',
        hideSourceMaps: true,
        disableLogger: true,
      },
      {
        dryRun: !process.env.NEXT_PUBLIC_SENTRY_DSN,
      }
    );

/**
 * Web Vitals Monitoring
 * Real User Monitoring (RUM) for performance metrics
 */

import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

export function initWebVitals() {
  // Cumulative Layout Shift
  getCLS((metric) => {
    console.log('CLS:', metric);
    captureMetric('cls', metric);
  });

  // First Input Delay
  getFID((metric) => {
    console.log('FID:', metric);
    captureMetric('fid', metric);
  });

  // First Contentful Paint
  getFCP((metric) => {
    console.log('FCP:', metric);
    captureMetric('fcp', metric);
  });

  // Largest Contentful Paint
  getLCP((metric) => {
    console.log('LCP:', metric);
    captureMetric('lcp', metric);
  });

  // Time to First Byte
  getTTFB((metric) => {
    console.log('TTFB:', metric);
    captureMetric('ttfb', metric);
  });
}

function captureMetric(name: string, metric: any) {
  // Send to analytics endpoint
  if (typeof window !== 'undefined') {
    try {
      navigator.sendBeacon(
        '/api/analytics/metrics',
        JSON.stringify({
          metric: name,
          value: metric.value,
          rating: metric.rating,
          timestamp: new Date().toISOString(),
        })
      );
    } catch (e) {
      console.error(`Failed to send ${name} metric:`, e);
    }
  }
}

// Thresholds for "good" metrics
export const METRIC_THRESHOLDS = {
  cls: 0.1, // Cumulative Layout Shift
  fid: 100, // First Input Delay (ms)
  fcp: 1800, // First Contentful Paint (ms)
  lcp: 2500, // Largest Contentful Paint (ms)
  ttfb: 600, // Time to First Byte (ms)
};

export const METRIC_RATINGS = {
  good: 'good',
  'needs-improvement': 'needs-improvement',
  poor: 'poor',
};

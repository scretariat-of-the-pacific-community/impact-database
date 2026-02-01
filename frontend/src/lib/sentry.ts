import * as Sentry from '@sentry/nextjs'

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

// Initialize Sentry
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Session Replay
    replaysSessionSampleRate: 0.1, // 10% of sessions
    replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors
    environment: process.env.NODE_ENV,
    // Ignore certain errors
    ignoreErrors: [
      // Browser extensions
      'top.GLOBALS',
      'plugin',
      'chrome-extension://',
      'moz-extension://',
      // Network errors that are not actionable
      'NetworkError',
      'Network request failed',
    ],
    // Allow URLs
    allowUrls: [/https:\/\/(opmthredds\.)?gem\.spc\.int/],
    // Before send hook - filter sensitive data
    beforeSend(event, hint) {
      // Remove sensitive query parameters
      if (event.request?.url) {
        const url = new URL(event.request.url)
        url.searchParams.delete('token')
        url.searchParams.delete('password')
        url.searchParams.delete('api_key')
        event.request.url = url.toString()
      }

      // Filter sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['Authorization']
        delete event.request.headers['Cookie']
      }

      return event
    },
  })
}

export default Sentry

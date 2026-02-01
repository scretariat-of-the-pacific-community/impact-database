import * as Sentry from '@sentry/nextjs'
import type { NextApiRequest, NextApiResponse } from 'next'

const SENTRY_DSN = process.env.SENTRY_DSN_API

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.ENVIRONMENT || 'production',
    tracesSampleRate: process.env.ENVIRONMENT === 'production' ? 0.1 : 1.0,
    beforeSend(event, hint) {
      // Remove sensitive data from request body
      if (event.request?.data) {
        event.request.data = sanitizeData(event.request.data)
      }

      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization']
        delete event.request.headers['cookie']
        delete event.request.headers['x-api-key']
      }

      return event
    },
  })
}

/**
 * Sanitize potentially sensitive data from logs
 */
function sanitizeData(data: any): any {
  if (typeof data !== 'object' || data === null) {
    return data
  }

  const sensitiveKeys = ['password', 'token', 'api_key', 'secret', 'authorization']
  const sanitized = { ...data }

  sensitiveKeys.forEach(key => {
    if (key in sanitized) {
      sanitized[key] = '***REDACTED***'
    }
  })

  return sanitized
}

/**
 * Capture exception in API routes
 */
export function captureApiException(
  error: Error,
  request: NextApiRequest,
  context?: Record<string, any>
) {
  if (!SENTRY_DSN) return

  Sentry.captureException(error, {
    contexts: {
      http: {
        method: request.method,
        url: request.url,
        query: request.query,
      },
      ...context,
    },
    tags: {
      endpoint: request.url?.split('?')[0] || 'unknown',
      method: request.method || 'unknown',
    },
  })
}

/**
 * Capture message in API routes
 */
export function captureApiMessage(
  message: string,
  level: 'debug' | 'info' | 'warning' | 'error' = 'info',
  context?: Record<string, any>
) {
  if (!SENTRY_DSN) return

  Sentry.captureMessage(message, {
    level,
    contexts: context ? { custom: context } : undefined,
  })
}

export default Sentry

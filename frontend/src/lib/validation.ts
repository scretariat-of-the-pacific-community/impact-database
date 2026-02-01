/**
 * Input Validation Utilities
 * Handles form validation, security checks, and file validation
 */

// Form Field Validation
export const validateTitle = (title: string): boolean => {
  if (!title || typeof title !== 'string') return false
  const trimmed = title.trim()
  return trimmed.length >= 3 && trimmed.length <= 200
}

export const validateDescription = (description: string): boolean => {
  if (!description) return true // Optional field
  if (typeof description !== 'string') return false
  const trimmed = description.trim()
  return trimmed.length >= 10 && trimmed.length <= 5000
}

export const validateCountry = (country: string): boolean => {
  if (!country || typeof country !== 'string') return false
  const validCountries = ['FJ', 'SB', 'VU', 'TO', 'WS', 'KI']
  return validCountries.includes(country.toUpperCase())
}

export const validateCoordinates = (lat: number, lon: number): boolean => {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
}

// XSS Prevention
export const sanitizeXSS = (input: string): string => {
  if (!input || typeof input !== 'string') return ''
  
  // Remove script tags and content
  let sanitized = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  
  // Escape special characters
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
  
  return sanitized
}

// SQL Injection Detection
export const detectSQLInjection = (input: string): boolean => {
  if (!input || typeof input !== 'string') return false
  
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|FROM|WHERE)\b)/gi,
    /(-{2}|\/\*|\*\/|;)/g,
    /(\bOR\b.*=.*)/gi,
    /(\bAND\b.*=.*)/gi
  ]
  
  return sqlPatterns.some(pattern => pattern.test(input))
}

// File Validation
export const validateFileSize = (fileSize: number, maxSizeMB: number = 50): boolean => {
  if (typeof fileSize !== 'number') return false
  const maxSizeBytes = maxSizeMB * 1024 * 1024
  return fileSize > 0 && fileSize <= maxSizeBytes
}

export const validateImageType = (filename: string): boolean => {
  if (!filename || typeof filename !== 'string') return false
  const validImageTypes = ['jpg', 'jpeg', 'png', 'webp', 'gif']
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return validImageTypes.includes(ext)
}

export const validateVideoType = (filename: string): boolean => {
  if (!filename || typeof filename !== 'string') return false
  const validVideoTypes = ['mp4', 'webm', 'quicktime', 'mov']
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return validVideoTypes.includes(ext)
}

// Combined Form Validation
export const validateFormData = (data: {
  title: string
  description?: string
  country: string
  latitude: number
  longitude: number
}): { valid: boolean; errors: string[] } => {
  const errors: string[] = []
  
  if (!validateTitle(data.title)) {
    errors.push('Title must be between 3-200 characters')
  }
  
  if (data.description && !validateDescription(data.description)) {
    errors.push('Description must be between 10-5000 characters')
  }
  
  if (!validateCountry(data.country)) {
    errors.push('Invalid country selection')
  }
  
  if (!validateCoordinates(data.latitude, data.longitude)) {
    errors.push('Invalid coordinates')
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

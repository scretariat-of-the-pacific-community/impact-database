/**
 * Authentication Utilities
 * Handles token validation and credential verification
 */

// JWT Token Validation
export const validateToken = (token: string): boolean => {
  if (!token || typeof token !== 'string') return false
  
  // JWT format: xxx.yyy.zzz
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid token format')
  }
  
  try {
    // Decode and validate base64 format
    parts.forEach(part => {
      if (!part) throw new Error('Invalid token part')
      // Try to decode base64
      Buffer.from(part, 'base64').toString('utf-8')
    })
    return true
  } catch {
    throw new Error('Invalid token format')
  }
}

// Token Expiration Check
export const isTokenExpired = (token: string): boolean => {
  if (!token || typeof token !== 'string') return true
  
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return true
    
    // Decode payload (second part)
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'))
    
    if (!payload.exp) return true
    
    // Check if expiration timestamp is in the past
    const expirationTime = payload.exp * 1000 // Convert to milliseconds
    return expirationTime < Date.now()
  } catch {
    return true
  }
}

// Email Validation
export const validateEmail = (email: string): boolean => {
  if (!email || typeof email !== 'string') return false
  
  // RFC 5322 simplified email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Password Validation
export const validatePassword = (password: string): boolean => {
  if (!password || typeof password !== 'string') return false
  
  // Minimum 8 characters
  return password.length >= 8
}

// Credentials Validation
export const validateCredentials = (
  email: string,
  password: string
): { valid: boolean; errors: string[] } => {
  const errors: string[] = []
  
  if (!validateEmail(email)) {
    errors.push('Invalid email format')
  }
  
  if (!validatePassword(password)) {
    errors.push('Password must be at least 8 characters')
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

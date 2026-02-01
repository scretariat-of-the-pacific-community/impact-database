/**
 * Authentication Tests
 * Critical tests for auth provider and login flow
 */

import { validateToken, isTokenExpired, validateEmail, validatePassword, validateCredentials } from '../lib/auth'

describe('Authentication', () => {
  describe('Token Validation', () => {
    it('should validate JWT token format', () => {
      const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
      expect(validateToken(validToken)).toBe(true)
    })

    it('should reject invalid token format', () => {
      expect(() => {
        validateToken('invalid-token')
      }).toThrow('Invalid token format')
    })

    it('should check token expiration', () => {
      // Create a token with past expiration (more than 2 minutes old)
      const pastExp = Math.floor(Date.now() / 1000) - 7200
      const payload = JSON.stringify({ exp: pastExp })
      const encodedPayload = Buffer.from(payload).toString('base64')
      const expiredToken = `header.${encodedPayload}.signature`
      
      expect(isTokenExpired(expiredToken)).toBe(true)
    })
  })

  describe('Credentials', () => {
    it('should require email and password', () => {
      const result = validateCredentials('', '')
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should validate email format', () => {
      expect(validateEmail('user@example.com')).toBe(true)
      expect(validateEmail('invalid.email')).toBe(false)
      expect(validateEmail('user@domain')).toBe(false)
    })

    it('should enforce minimum password length', () => {
      expect(validatePassword('short')).toBe(false)
      expect(validatePassword('validpassword123')).toBe(true)
    })
  })
})

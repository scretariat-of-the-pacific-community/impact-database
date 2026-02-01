/**
 * Input Validation Tests
 * Critical tests for form validation and sanitization
 */

import {
  validateTitle,
  validateDescription,
  validateCountry,
  validateCoordinates,
  sanitizeXSS,
  detectSQLInjection,
  validateFileSize,
  validateImageType,
  validateVideoType
} from '../lib/validation'

describe('Input Validation', () => {
  describe('Form Fields', () => {
    it('should validate title field', () => {
      expect(validateTitle('Valid Title')).toBe(true)
      expect(validateTitle('AB')).toBe(false)
      expect(validateTitle('')).toBe(false)
    })

    it('should validate description field', () => {
      expect(validateDescription('Valid description text here')).toBe(true)
      expect(validateDescription('short')).toBe(false)
      expect(validateDescription('')).toBe(true) // Optional field
    })

    it('should validate country code', () => {
      expect(validateCountry('FJ')).toBe(true)
      expect(validateCountry('XX')).toBe(false)
    })

    it('should validate latitude/longitude', () => {
      expect(validateCoordinates(-18.142599, 178.065032)).toBe(true) // Fiji
      expect(validateCoordinates(91, 180)).toBe(false) // Invalid lat
      expect(validateCoordinates(0, 200)).toBe(false) // Invalid lng
    })
  })

  describe('XSS Prevention', () => {
    it('should sanitize HTML input', () => {
      const malicious = '<script>alert("xss")</script>Hello'
      expect(sanitizeXSS(malicious)).not.toContain('<script>')
    })

    it('should escape special characters', () => {
      expect(sanitizeXSS('<div>')).toContain('&lt;')
      expect(sanitizeXSS('alert("xss")')).not.toContain('<')
    })

    it('should prevent SQL injection patterns', () => {
      expect(detectSQLInjection("'; DROP TABLE users--")).toBe(true)
      expect(detectSQLInjection('Normal user input')).toBe(false)
    })
  })

  describe('File Upload', () => {
    it('should validate file size', () => {
      const MAX_FILE_SIZE = 50 // 50MB
      expect(validateFileSize(25 * 1024 * 1024, MAX_FILE_SIZE)).toBe(true)
      expect(validateFileSize(60 * 1024 * 1024, MAX_FILE_SIZE)).toBe(false)
    })

    it('should validate image file types', () => {
      expect(validateImageType('photo.jpg')).toBe(true)
      expect(validateImageType('photo.jpeg')).toBe(true)
      expect(validateImageType('photo.png')).toBe(true)
      expect(validateImageType('photo.bmp')).toBe(false)
    })

    it('should validate video file types', () => {
      expect(validateVideoType('video.mp4')).toBe(true)
      expect(validateVideoType('video.webm')).toBe(true)
      expect(validateVideoType('audio.mp3')).toBe(false)
    })
  })
})

import '@testing-library/jest-dom';

jest.mock('@/lib/analytics', () => ({
  trackPageView: jest.fn(),
  trackUploadEvent: jest.fn(),
  trackFilterApplied: jest.fn(),
  trackMapInteraction: jest.fn(),
  trackQueryError: jest.fn(),
  trackEvent: jest.fn(),
}));

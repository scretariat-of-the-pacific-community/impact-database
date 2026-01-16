/**
 * Navigation utilities for handling basePath in subdirectory deployments
 */

/**
 * Get the configured basePath from environment
 */
export const getBasePath = (): string => {
  return process.env.NEXT_PUBLIC_BASE_PATH || '';
};

/**
 * Add basePath to a route for router.push() or window.location
 * @param path - The path to navigate to (e.g., '/profile')
 * @returns The path with basePath prepended (e.g., '/impact-database/profile')
 */
export const withBasePath = (path: string): string => {
  const basePath = getBasePath();

  // Don't double-add basePath if it's already there
  if (basePath && path.startsWith(basePath)) {
    return path;
  }

  // Handle absolute URLs - don't modify them
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('mailto:')
  ) {
    return path;
  }

  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return basePath + normalizedPath;
};

/**
 * Offline Storage Module
 * IndexedDB wrapper for caching profile data and uploads for offline access
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { UserStats, UserUpload } from './types';

interface OfflineDB extends DBSchema {
  'user-stats': {
    key: string;
    value: {
      id: string;
      data: UserStats;
      timestamp: number;
    };
  };
  'user-uploads': {
    key: string;
    value: {
      id: string;
      data: UserUpload[];
      timestamp: number;
    };
  };
  'pending-uploads': {
    key: string;
    value: {
      id: string;
      file: Blob;
      metadata: Record<string, unknown>;
      timestamp: number;
      retryCount: number;
    };
    indexes: { timestamp: number };
  };
  'activity': {
    key: string;
    value: {
      id: string;
      data: unknown[];
      timestamp: number;
    };
  };
}

const DB_NAME = 'impact-offline-db';
const DB_VERSION = 1;
const CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 hours

let dbInstance: IDBPDatabase<OfflineDB> | null = null;

/**
 * Initialize IndexedDB connection
 */
async function getDB(): Promise<IDBPDatabase<OfflineDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<OfflineDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // User stats store
      if (!db.objectStoreNames.contains('user-stats')) {
        db.createObjectStore('user-stats', { keyPath: 'id' });
      }

      // User uploads store
      if (!db.objectStoreNames.contains('user-uploads')) {
        db.createObjectStore('user-uploads', { keyPath: 'id' });
      }

      // Pending uploads store (for background sync)
      if (!db.objectStoreNames.contains('pending-uploads')) {
        const store = db.createObjectStore('pending-uploads', { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
      }

      // Activity timeline store
      if (!db.objectStoreNames.contains('activity')) {
        db.createObjectStore('activity', { keyPath: 'id' });
      }
    },
  });

  return dbInstance;
}

/**
 * Check if cached data is still fresh
 */
function isCacheFresh(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_DURATION;
}

/**
 * Cache user stats
 */
export async function cacheUserStats(userId: string, stats: UserStats): Promise<void> {
  const db = await getDB();
  await db.put('user-stats', {
    id: userId,
    data: stats,
    timestamp: Date.now(),
  });
}

/**
 * Get cached user stats
 */
export async function getCachedUserStats(userId: string): Promise<UserStats | null> {
  const db = await getDB();
  const cached = await db.get('user-stats', userId);

  if (!cached) return null;
  if (!isCacheFresh(cached.timestamp)) {
    await db.delete('user-stats', userId);
    return null;
  }

  return cached.data;
}

/**
 * Cache user uploads
 */
export async function cacheUserUploads(userId: string, uploads: UserUpload[]): Promise<void> {
  const db = await getDB();
  await db.put('user-uploads', {
    id: userId,
    data: uploads,
    timestamp: Date.now(),
  });
}

/**
 * Get cached user uploads
 */
export async function getCachedUserUploads(userId: string): Promise<UserUpload[] | null> {
  const db = await getDB();
  const cached = await db.get('user-uploads', userId);

  if (!cached) return null;
  if (!isCacheFresh(cached.timestamp)) {
    await db.delete('user-uploads', userId);
    return null;
  }

  return cached.data;
}

/**
 * Cache activity timeline
 */
export async function cacheActivity(userId: string, activity: unknown[]): Promise<void> {
  const db = await getDB();
  await db.put('activity', {
    id: userId,
    data: activity,
    timestamp: Date.now(),
  });
}

/**
 * Get cached activity
 */
export async function getCachedActivity(userId: string): Promise<unknown[] | null> {
  const db = await getDB();
  const cached = await db.get('activity', userId);

  if (!cached) return null;
  if (!isCacheFresh(cached.timestamp)) {
    await db.delete('activity', userId);
    return null;
  }

  return cached.data;
}

/**
 * Queue upload for background sync
 */
export async function queuePendingUpload(
  file: Blob,
  metadata: Record<string, unknown>
): Promise<string> {
  const db = await getDB();
  const id = `upload-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  await db.add('pending-uploads', {
    id,
    file,
    metadata,
    timestamp: Date.now(),
    retryCount: 0,
  });

  // Trigger background sync if available
  if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
    const registration = await navigator.serviceWorker.ready;
    // @ts-expect-error Background Sync API not in TypeScript definitions yet
    await registration.sync.register('sync-uploads');
  }

  return id;
}

/**
 * Get all pending uploads
 */
export async function getPendingUploads() {
  const db = await getDB();
  return db.getAll('pending-uploads');
}

/**
 * Remove pending upload after successful sync
 */
export async function removePendingUpload(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('pending-uploads', id);
}

/**
 * Increment retry count for failed upload
 */
export async function incrementRetryCount(id: string): Promise<void> {
  const db = await getDB();
  const upload = await db.get('pending-uploads', id);

  if (upload) {
    upload.retryCount += 1;
    await db.put('pending-uploads', upload);
  }
}

/**
 * Clear all cached data
 */
export async function clearOfflineCache(): Promise<void> {
  const db = await getDB();
  await db.clear('user-stats');
  await db.clear('user-uploads');
  await db.clear('activity');
}

/**
 * Clear all pending uploads
 */
export async function clearPendingUploads(): Promise<void> {
  const db = await getDB();
  await db.clear('pending-uploads');
}

/**
 * Get storage usage
 */
export async function getStorageUsage(): Promise<{
  usage: number;
  quota: number;
  percentage: number;
}> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const percentage = quota > 0 ? (usage / quota) * 100 : 0;

    return {
      usage,
      quota,
      percentage,
    };
  }

  return { usage: 0, quota: 0, percentage: 0 };
}

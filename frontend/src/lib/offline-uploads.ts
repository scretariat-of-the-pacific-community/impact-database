import { toast } from 'sonner';

const DB_NAME = 'ocean_offline_uploads';
const DB_VERSION = 1;
const STORE_NAME = 'uploads';

export interface QueuedUploadPayload {
  id: string;
  createdAt: number;
  metadata: Record<string, any>;
  fileName: string;
  fileType: string;
  fileData: Blob; // Store as Blob instead of base64
  fileSize: number;
}

const isBrowser = typeof window !== 'undefined';

// Initialize IndexedDB
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (!isBrowser) {
      reject(new Error('Not in browser environment'));
      return;
    }
    
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
};

const readQueue = async (): Promise<QueuedUploadPayload[]> => {
  if (!isBrowser) return [];
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to read upload queue:', error);
    return [];
  }
};

const deleteQueuedUpload = async (id: string) => {
  if (!isBrowser) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error(`Failed to delete queued upload ${id}:`, error);
  }
};

export const getQueuedUploads = async () => readQueue();

export const queueUpload = async (metadata: Record<string, any>, file: File) => {
  if (!isBrowser) return;
  
  // Check file size (warn if > 50MB)
  const MAX_SIZE = 50 * 1024 * 1024; // 50MB
  if (file.size > MAX_SIZE) {
    toast.error('File too large for offline queue', {
      description: `${file.name} exceeds 50MB. Please upload while online.`,
      duration: 8000,
    });
    throw new Error('File too large for offline storage');
  }
  
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const payload: QueuedUploadPayload = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      metadata,
      fileName: file.name,
      fileType: file.type,
      fileData: file, // Store File object directly (it's a Blob)
      fileSize: file.size,
    };
    
    const request = store.add(payload);
    
    await new Promise((resolve, reject) => {
      request.onsuccess = resolve;
      request.onerror = () => {
        // Check for quota errors
        if (request.error?.name === 'QuotaExceededError') {
          toast.error('Storage quota exceeded', {
            description: 'Cannot queue more uploads offline. Please clear old uploads or go online.',
            duration: 10000,
          });
          reject(new Error('Storage quota exceeded'));
        } else {
          reject(request.error);
        }
      };
    });
    
    // Show success notification
    toast.success('Upload queued for sync', {
      description: `${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB) will be uploaded when you're back online`,
      duration: 5000,
    });
  } catch (error) {
    console.error('Failed to queue upload:', error);
    toast.error('Failed to queue upload', {
      description: error instanceof Error ? error.message : 'Unknown error',
      duration: 5000,
    });
    throw error;
  }
};

export const flushQueuedUploads = async (
  uploader: (payload: QueuedUploadPayload) => Promise<void>,
  onStatus?: (payload: QueuedUploadPayload, status: 'success' | 'error') => void
) => {
  if (!isBrowser) return;
  const queue = await readQueue();
  if (queue.length === 0) return;

  // Show initial toast
  const uploadingToast = toast.loading(`Syncing ${queue.length} queued upload${queue.length > 1 ? 's' : ''}...`);

  let successCount = 0;
  let errorCount = 0;

  for (const payload of queue) {
    try {
      await uploader(payload);
      await deleteQueuedUpload(payload.id);
      successCount++;
      onStatus?.(payload, 'success');
    } catch (error) {
      errorCount++;
      onStatus?.(payload, 'error');
    }
  }

  // Dismiss loading toast
  toast.dismiss(uploadingToast);

  // Show result toast
  if (successCount > 0 && errorCount === 0) {
    toast.success(`Successfully synced ${successCount} upload${successCount > 1 ? 's' : ''}`, {
      description: 'All queued uploads are now in the database',
    });
  } else if (successCount > 0 && errorCount > 0) {
    toast.warning(`Synced ${successCount} upload${successCount > 1 ? 's' : ''}, ${errorCount} failed`, {
      description: 'Failed uploads will retry on next connection',
      action: {
        label: 'Retry',
        onClick: () => {
          // User can manually trigger flush again
          window.dispatchEvent(new CustomEvent('retry-offline-uploads'));
        },
      },
    });
  } else if (errorCount > 0) {
    toast.error('Failed to sync uploads', {
      description: 'Will retry automatically when connection improves',
      action: {
        label: 'Retry',
        onClick: () => {
          window.dispatchEvent(new CustomEvent('retry-offline-uploads'));
        },
      },
    });
  }
};

export const subscribeToOnlineFlush = (fn: () => void) => {
  if (!isBrowser) return () => undefined;
  window.addEventListener('online', fn);
  return () => window.removeEventListener('online', fn);
};

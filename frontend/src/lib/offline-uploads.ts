import { toast } from 'sonner';

const STORAGE_KEY = 'ocean_offline_uploads';

export interface QueuedUploadPayload {
  id: string;
  createdAt: number;
  metadata: Record<string, any>;
  fileName: string;
  fileType: string;
  fileData: string; // base64
}

const isBrowser = typeof window !== 'undefined';

const readQueue = (): QueuedUploadPayload[] => {
  if (!isBrowser) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

const writeQueue = (queue: QueuedUploadPayload[]) => {
  if (!isBrowser) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
};

export const getQueuedUploads = () => readQueue();

export const queueUpload = async (metadata: Record<string, any>, file: File) => {
  if (!isBrowser) return;
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  const fileData = btoa(binary);

  const queue = readQueue();
  queue.push({
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    metadata,
    fileName: file.name,
    fileType: file.type,
    fileData,
  });
  writeQueue(queue);
  
  // Show toast notification
  toast.info('Upload queued for sync', {
    description: `${file.name} will be uploaded when you're back online`,
    duration: 5000,
  });
};

export const flushQueuedUploads = async (
  uploader: (payload: QueuedUploadPayload) => Promise<void>,
  onStatus?: (payload: QueuedUploadPayload, status: 'success' | 'error') => void
) => {
  if (!isBrowser) return;
  const queue = readQueue();
  if (queue.length === 0) return;

  // Show initial toast
  const uploadingToast = toast.loading(`Syncing ${queue.length} queued upload${queue.length > 1 ? 's' : ''}...`);

  const remaining: QueuedUploadPayload[] = [];
  let successCount = 0;
  let errorCount = 0;

  for (const payload of queue) {
    try {
      await uploader(payload);
      successCount++;
      onStatus?.(payload, 'success');
    } catch (error) {
      remaining.push(payload);
      errorCount++;
      onStatus?.(payload, 'error');
    }
  }
  writeQueue(remaining);

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

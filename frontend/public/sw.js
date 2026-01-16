const SHELL_CACHE = 'ocean-shell-v2';
const DATA_CACHE = 'ocean-data-v2';  // Bumped version to clear stale image metadata
const BASE_PATH = (() => {
  const scopePath = new URL(self.registration.scope).pathname;
  if (scopePath === '/' || scopePath === '') {
    return '';
  }
  return scopePath.endsWith('/') ? scopePath.slice(0, -1) : scopePath;
})();
const withBasePath = (path) => {
  if (!BASE_PATH) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith(BASE_PATH)) return path;
  return `${BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;
};
const OFFLINE_URL = withBasePath('/offline');
const SHELL_ASSETS = [
  withBasePath('/'),
  OFFLINE_URL,
  withBasePath('/manifest.json'),
  withBasePath('/favicon.ico'),
  withBasePath('/icons/icon-192.svg'),
  withBasePath('/icons/icon-512.svg'),
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

const isApiRequest = (url) => {
  // Only intercept same-origin API requests
  return url.origin === self.location.origin && url.pathname.startsWith(withBasePath('/api/'));
};

const isNextJsInternalRequest = (url) => {
  // Don't intercept Next.js internal routes (fonts, chunks, etc.)
  return url.pathname.startsWith(withBasePath('/__nextjs')) || 
         url.pathname.startsWith(withBasePath('/_next/')) ||
         url.pathname.includes('hot-reload.js');
};

const isCacheableScheme = (url) => {
  // Only cache http and https schemes
  return url.protocol === 'http:' || url.protocol === 'https:';
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Don't intercept unsupported schemes (chrome-extension:, devtools:, etc.)
  if (!isCacheableScheme(url)) {
    return;
  }

  // Don't intercept cross-origin requests (e.g., to localhost:8000)
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.method !== 'GET') {
    return;
  }

  // Don't intercept Next.js internal routes
  if (isNextJsInternalRequest(url)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(handlePageRequest(request));
    return;
  }

  if (isApiRequest(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (request.destination === 'style' || request.destination === 'script' || request.destination === 'image') {
    event.respondWith(cacheFirst(request));
    return;
  }
});

async function handlePageRequest(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(SHELL_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    const offline = await cache.match(OFFLINE_URL);
    return offline || new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function networkFirst(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  try {
    const response = await fetch(request);
    // Only cache valid responses with cacheable schemes
    if (response && response.status === 200) {
      const url = new URL(request.url);
      if (isCacheableScheme(url)) {
        cache.put(request, response.clone()).catch(() => {
          // Silently ignore cache errors
        });
      }
    }
    return response;
  } catch (error) {
    // Return a minimal response if fetch fails
    return new Response('', { status: 503, statusText: 'Service Unavailable' });
  }
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Background sync - upload queued images
self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Background sync:', event.tag);

  if (event.tag === 'sync-uploads') {
    event.waitUntil(syncPendingUploads());
  }
});

// Push notification received
self.addEventListener('push', (event) => {
  console.log('[ServiceWorker] Push notification received');

  let notification = {
    title: 'Impact Database',
    body: 'You have a new notification',
    icon: withBasePath('/icons/icon-192.svg'),
    badge: withBasePath('/icons/icon-badge.svg'),
    tag: 'impact-notification',
    requireInteraction: false,
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notification = {
        ...notification,
        title: data.title || notification.title,
        body: data.body || notification.body,
        tag: data.tag || notification.tag,
        data: data.data || {},
      };
    } catch (error) {
      console.error('[ServiceWorker] Failed to parse push data:', error);
    }
  }

  event.waitUntil(
    self.registration.showNotification(notification.title, {
      body: notification.body,
      icon: notification.icon,
      badge: notification.badge,
      tag: notification.tag,
      requireInteraction: notification.requireInteraction,
      data: notification.data,
      vibrate: [200, 100, 200],
      actions: [
        { action: 'view', title: 'View' },
        { action: 'close', title: 'Close' },
      ],
    })
  );
});

// Notification clicked
self.addEventListener('notificationclick', (event) => {
  console.log('[ServiceWorker] Notification clicked:', event.action);

  event.notification.close();

  if (event.action === 'view') {
    const urlToOpen = withBasePath(event.notification.data?.url || '/profile');

    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        // Focus existing window if available
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
    );
  }
});

// Helper function to sync pending uploads
async function syncPendingUploads() {
  try {
    // Open IndexedDB
    const db = await openIndexedDB();
    const transaction = db.transaction(['pending-uploads'], 'readwrite');
    const store = transaction.objectStore('pending-uploads');
    const uploads = await getAllFromStore(store);

    console.log('[ServiceWorker] Syncing', uploads.length, 'pending uploads');

    for (const upload of uploads) {
      try {
        const formData = new FormData();
        formData.append('file', upload.file);

        // Add metadata
        for (const [key, value] of Object.entries(upload.metadata)) {
          formData.append(key, String(value));
        }

        const response = await fetch(withBasePath('/api/images/upload'), {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (response.ok) {
          // Remove from pending queue
          await deleteFromStore(store, upload.id);
          console.log('[ServiceWorker] Successfully synced upload:', upload.id);

          // Show success notification
          await self.registration.showNotification('Upload Successful', {
            body: 'Your image has been uploaded and is being reviewed.',
            icon: withBasePath('/icons/icon-192.svg'),
            tag: 'upload-success',
          });
        } else {
          // Increment retry count
          upload.retryCount = (upload.retryCount || 0) + 1;
          if (upload.retryCount < 3) {
            await putToStore(store, upload);
          } else {
            // Give up after 3 retries
            await deleteFromStore(store, upload.id);
            console.error('[ServiceWorker] Failed to sync upload after 3 retries:', upload.id);
          }
        }
      } catch (error) {
        console.error('[ServiceWorker] Error syncing upload:', error);
      }
    }

    await completeTransaction(transaction);
  } catch (error) {
    console.error('[ServiceWorker] Background sync failed:', error);
    throw error;
  }
}

// Helper function to open IndexedDB
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('impact-offline-db', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Helper function to get all items from store
function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Helper function to delete from store
function deleteFromStore(store, key) {
  return new Promise((resolve, reject) => {
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Helper function to put to store
function putToStore(store, value) {
  return new Promise((resolve, reject) => {
    const request = store.put(value);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Helper function to complete transaction
function completeTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

const SHELL_CACHE = 'ocean-shell-v2';
const DATA_CACHE = 'ocean-data-v1';
const OFFLINE_URL = '/offline';
const SHELL_ASSETS = [
  '/',
  OFFLINE_URL,
  '/manifest.json',
  '/favicon.ico',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
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
  return url.origin === self.location.origin && url.pathname.startsWith('/api/');
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

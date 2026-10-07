# Mobile Features - Quick Reference

## 🚀 Quick Start

### Using Mobile Components

```tsx
// Profile page with mobile optimization
import MobileBottomNav from '@/components/profile/MobileBottomNav';
import SwipeableTabs from '@/components/profile/SwipeableTabs';
import InfiniteUploadList from '@/components/profile/InfiniteUploadList';

// Bottom navigation (mobile only)
<div className="fixed bottom-0 left-0 right-0 z-40 md:hidden">
  <MobileBottomNav
    activeTab={activeTab}
    onTabChange={setActiveTab}
    items={PROFILE_NAV_ITEMS}
  />
</div>

// Swipeable tabs (mobile only)
<div className="block md:hidden">
  <SwipeableTabs
    activeTab={activeTab}
    onTabChange={setActiveTab}
    tabs={TABS}
  >
    <div className="p-4">{content}</div>
  </SwipeableTabs>
</div>

// Infinite scroll upload list
<InfiniteUploadList />
```

### Offline Storage

```typescript
import {
  cacheUserStats,
  getCachedUserStats,
  queuePendingUpload,
  getStorageUsage,
} from '@/lib/offline-storage';

// Cache user data
await cacheUserStats(userId, stats);

// Get cached data
const cached = await getCachedUserStats(userId);

// Queue offline upload
const uploadId = await queuePendingUpload(file, {
  hazard_type: 'flood',
  description: 'Flooded street',
  latitude: 37.7749,
  longitude: -122.4194,
});

// Check storage
const { usage, quota, percentage } = await getStorageUsage();
```

### Push Notifications

```typescript
import {
  initializePushNotifications,
  subscribeToPushNotifications,
  showLocalNotification,
  getNotificationPermissionStatus,
} from '@/lib/push-notifications';

// Initialize (call on app load or settings)
const { success, subscription } = await initializePushNotifications();

// Check permission
const permission = getNotificationPermissionStatus();
// Returns: 'granted' | 'denied' | 'default'

// Show test notification
await showLocalNotification('Test', {
  body: 'This is a test notification',
  icon: '/icons/icon-192.svg',
  tag: 'test',
});
```

## 📱 Routes

| Route                       | Description                         | Mobile-Optimized |
| --------------------------- | ----------------------------------- | ---------------- |
| `/profile`                  | User profile with stats and uploads | ✅ Yes           |
| `/profile?tab=uploads`      | Upload history                      | ✅ Yes           |
| `/profile?tab=activity`     | Activity timeline                   | ✅ Yes           |
| `/profile?tab=achievements` | Achievements and badges             | ✅ Yes           |
| `/profile?tab=analytics`    | Statistics and insights             | ✅ Yes           |
| `/profile?tab=settings`     | User preferences                    | ✅ Yes           |
| `/upload/mobile`            | Camera-first upload                 | ✅ Mobile-only   |
| `/profile/settings`         | Comprehensive settings page         | ✅ Yes           |

## 🎨 Responsive Breakpoints

```css
/* Mobile: 0-767px */
.mobile-only {
  display: block;
}
.desktop-only {
  display: none;
}

/* Desktop: 768px+ */
@media (min-width: 768px) {
  .mobile-only {
    display: none;
  }
  .desktop-only {
    display: block;
  }
}
```

## 🎯 Touch Target Sizes

All interactive elements follow WCAG 2.1 AAA:

```tsx
// Minimum touch target
<button className="min-w-[44px] min-h-[44px]">
  Click me
</button>

// With padding
<button className="px-4 py-3 min-w-[44px] min-h-[44px]">
  <Icon className="h-5 w-5" />
</button>

// Icon-only button
<button className="p-3 min-w-[44px] min-h-[44px]">
  <Icon className="h-6 w-6" />
</button>
```

## 🔄 Background Sync

### Service Worker Events

```javascript
// In sw.js
self.addEventListener('sync', async (event) => {
  if (event.tag === 'sync-uploads') {
    event.waitUntil(syncPendingUploads());
  }
});

// Trigger sync from client
const registration = await navigator.serviceWorker.ready;
await registration.sync.register('sync-uploads');
```

### Queue Upload for Sync

```typescript
// Queue upload when offline
await queuePendingUpload(file, metadata);

// Service worker will sync automatically when online
// Or manually trigger:
if ('serviceWorker' in navigator) {
  const registration = await navigator.serviceWorker.ready;
  // @ts-expect-error Background Sync API
  await registration.sync.register('sync-uploads');
}
```

## 📷 Camera Upload

### Open Camera

```typescript
const stream = await navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: 'environment', // Back camera
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
});
```

### Capture Photo

```typescript
const canvas = document.createElement('canvas');
canvas.width = video.videoWidth;
canvas.height = video.videoHeight;

const ctx = canvas.getContext('2d');
ctx.drawImage(video, 0, 0);

canvas.toBlob(
  (blob) => {
    const file = new File([blob], `capture-${Date.now()}.jpg`, {
      type: 'image/jpeg',
    });
    // Upload file
  },
  'image/jpeg',
  0.92
);
```

### Get GPS Location

```typescript
navigator.geolocation.getCurrentPosition(
  (position) => {
    const { latitude, longitude } = position.coords;
    console.log('GPS:', latitude, longitude);
  },
  (error) => {
    console.error('GPS error:', error.message);
  },
  {
    enableHighAccuracy: true,
    timeout: 5000,
    maximumAge: 0,
  }
);
```

## 🎭 Animations

### Swipe Gestures

```tsx
<motion.div
  drag="x"
  dragElastic={0.2}
  onDragEnd={(_, info) => {
    if (info.offset.x > 50 || info.velocity.x > 500) {
      // Swipe right
      handleSwipeRight();
    } else if (info.offset.x < -50 || info.velocity.x < -500) {
      // Swipe left
      handleSwipeLeft();
    }
  }}
/>
```

### Animated Indicator

```tsx
<motion.div
  layoutId="indicator"
  className="absolute inset-0 bg-pacific-500/20"
  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
/>
```

## 🔧 Configuration

### Environment Variables

```env
# .env.local
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key
NEXT_PUBLIC_SW_ENABLED=true
```

### Generate VAPID Keys

```bash
npx web-push generate-vapid-keys

# Output:
# Public Key: BNJxw...
# Private Key: T5pXL...

# Add public key to .env.local
# Add private key to backend secrets
```

## 🐛 Debugging

### Check Service Worker

```javascript
// In browser console
navigator.serviceWorker.getRegistrations().then((registrations) => {
  console.log('Registered service workers:', registrations);
});

// Get active service worker
navigator.serviceWorker.controller;
```

### Check IndexedDB

```javascript
// In browser console
indexedDB.databases().then((dbs) => {
  console.log('IndexedDB databases:', dbs);
});

// Open database manually
const request = indexedDB.open('impact-offline-db', 1);
request.onsuccess = () => {
  const db = request.result;
  console.log('DB stores:', db.objectStoreNames);
};
```

### Check Push Subscription

```javascript
// In browser console
navigator.serviceWorker.ready.then((registration) => {
  registration.pushManager.getSubscription().then((subscription) => {
    console.log('Push subscription:', subscription);
  });
});
```

### Check Storage Usage

```javascript
// In browser console
navigator.storage.estimate().then((estimate) => {
  console.log('Usage:', estimate.usage);
  console.log('Quota:', estimate.quota);
  console.log(
    'Percentage:',
    ((estimate.usage / estimate.quota) * 100).toFixed(2) + '%'
  );
});
```

## 📊 Performance

### Virtual Scrolling Settings

```typescript
// Desktop (react-window)
<FixedSizeList
  height={600}          // Container height
  itemCount={1000}      // Total items
  itemSize={180}        // Row height
  width="100%"
>
  {UploadRow}
</FixedSizeList>

// Mobile (simple list with intersection observer)
const observer = new IntersectionObserver(
  (entries) => {
    if (entries[0].isIntersecting) {
      fetchNextPage();
    }
  },
  { threshold: 0.5 }   // Trigger at 50% visibility
);
```

### Cache Configuration

```typescript
// Cache duration (24 hours)
const CACHE_DURATION = 1000 * 60 * 60 * 24;

// Check if cache is fresh
const isFresh = (timestamp: number) => {
  return Date.now() - timestamp < CACHE_DURATION;
};
```

## 🔐 Permissions

### Request Camera

```typescript
const hasCamera = await navigator.permissions.query({ name: 'camera' });
if (hasCamera.state === 'granted') {
  // Camera allowed
} else if (hasCamera.state === 'prompt') {
  // Will prompt on first use
} else {
  // Camera denied
}
```

### Request Location

```typescript
const hasLocation = await navigator.permissions.query({ name: 'geolocation' });
if (hasLocation.state === 'granted') {
  // Location allowed
}
```

### Request Notifications

```typescript
const permission = await Notification.requestPermission();
if (permission === 'granted') {
  // Notifications allowed
}
```

## 📚 Component Props

### MobileBottomNav

```typescript
interface MobileBottomNavProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  items: Array<{
    id: string;
    label: string;
    icon: LucideIcon;
  }>;
}
```

### SwipeableTabs

```typescript
interface SwipeableTabsProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  tabs: Array<{
    id: string;
    label: string;
    icon: LucideIcon;
  }>;
  children: React.ReactNode;
}
```

### InfiniteUploadList

```typescript
// No props - uses React Query internally
<InfiniteUploadList />
```

## 🎯 Best Practices

### Touch Targets

- ✅ Minimum 44×44px
- ✅ 8px spacing between targets
- ✅ Visual feedback on touch
- ❌ Don't use :hover for mobile interactions

### Swipe Gestures

- ✅ 50px minimum swipe distance
- ✅ 500px/s velocity threshold
- ✅ Visual indicators for swipeable content
- ❌ Don't hijack native scroll gestures

### Offline Support

- ✅ Cache essential data
- ✅ Queue failed uploads
- ✅ Show offline indicators
- ✅ Automatic sync when online
- ❌ Don't cache sensitive data

### Performance

- ✅ Virtual scrolling for large lists
- ✅ Lazy load images
- ✅ Optimize bundle size
- ✅ Use service worker caching
- ❌ Don't load all data at once

## 📞 Support

For issues or questions:

1. Check browser console for errors
2. Verify service worker is active
3. Check IndexedDB for cached data
4. Test permissions (camera, location, notifications)
5. Clear cache and reload if needed

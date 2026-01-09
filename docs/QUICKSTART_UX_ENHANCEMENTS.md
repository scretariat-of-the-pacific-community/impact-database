# Quick Start Guide - UX Enhancements

## 🚀 Using Toast Notifications

### Basic Usage

```typescript
import { toast } from 'sonner';

// Success
toast.success('Operation completed!');

// Error
toast.error('Something went wrong');

// Info
toast.info('Did you know...');

// Warning
toast.warning('Connection unstable');

// Loading
const loadingToast = toast.loading('Processing...');
// Later...
toast.dismiss(loadingToast);
toast.success('Done!');
```

### With Description

```typescript
toast.success('Upload complete', {
  description: 'Your image has been saved to the database',
  duration: 5000, // 5 seconds
});
```

### With Action Button

```typescript
toast.error('Failed to save', {
  description: 'Network error occurred',
  action: {
    label: 'Retry',
    onClick: () => {
      // Retry logic here
      retryUpload();
    },
  },
});
```

### Promise-Based (Auto-Updates)

```typescript
toast.promise(uploadImage(), {
  loading: 'Uploading image...',
  success: 'Image uploaded successfully!',
  error: 'Failed to upload image',
});
```

### Custom Icon

```typescript
import { Upload } from 'lucide-react';

toast('Custom notification', {
  icon: <Upload className="h-5 w-5" />,
  description: 'With a custom icon',
});
```

---

## ⌨️ Using Keyboard Shortcuts

### Global Shortcuts (Built-in)

Add to any page's layout:

```typescript
'use client';

import GlobalShortcutsProvider from '@/components/GlobalShortcutsProvider';

export default function Layout({ children }) {
  return (
    <>
      <GlobalShortcutsProvider />
      {children}
    </>
  );
}
```

**Available shortcuts:**
- `/` - Focus search
- `n` - New upload
- `h` - Go home
- `?` - Show help

### Modal Shortcuts

```typescript
import { useModalShortcuts } from '@/lib/keyboard-shortcuts';

function ImageModal({ isOpen, onClose, images, currentIndex }) {
  const goToNext = () => setCurrentIndex(currentIndex + 1);
  const goToPrevious = () => setCurrentIndex(currentIndex - 1);

  useModalShortcuts(
    isOpen,
    onClose,      // Triggered by Escape
    goToNext,     // Triggered by Arrow Right
    goToPrevious  // Triggered by Arrow Left
  );

  return (
    // ... modal JSX
  );
}
```

### Review Workflow Shortcuts

```typescript
import { useReviewShortcuts } from '@/lib/keyboard-shortcuts';

function ReviewQueue({ isActive }) {
  useReviewShortcuts(isActive, {
    onApprove: () => approveItem(),
    onReject: () => rejectItem(),
    onNext: () => moveToNext(),
    onFlag: () => flagForReview(),
  });

  return (
    // ... review UI
  );
}
```

### Custom Page Shortcuts

```typescript
import { useEffect } from 'react';

function MyPage() {
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ignore if user is typing
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA'
      ) {
        return;
      }

      switch (e.key) {
        case 'f':
          e.preventDefault();
          toggleFilters();
          break;
        case 's':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            saveForm();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, []);

  return (
    // ... page JSX
  );
}
```

---

## 📱 PWA Install Prompt

### Already Configured!

The PWA install prompt is automatically added to your root layout. No configuration needed!

### Customizing Behavior

Edit `src/components/PWAInstallPrompt.tsx`:

```typescript
// Change when prompt shows (default: 2nd visit)
if (visitCount < 1) return; // Change to < 2 for 3rd visit

// Change delay (default: 3 seconds)
setTimeout(() => {
  setShowPrompt(true);
}, 5000); // 5 seconds
```

### Manual Trigger (for testing)

```typescript
// Clear visit count
localStorage.removeItem('visit-count');
localStorage.removeItem('pwa-prompt-dismissed');
localStorage.removeItem('pwa-installed');

// Reload page
window.location.reload();
```

---

## 🔄 Offline Upload Queue

### Using in Upload Forms

```typescript
import { queueUpload, getQueuedUploads } from '@/lib/offline-uploads';
import { toast } from 'sonner';

async function handleUpload(metadata: Record<string, any>, file: File) {
  if (!navigator.onLine) {
    // Queue for later
    await queueUpload(metadata, file);
    // Toast notification automatically shown!
    return;
  }

  // Regular upload
  try {
    await uploadToServer(metadata, file);
    toast.success('Upload complete!');
  } catch (error) {
    toast.error('Upload failed', {
      action: {
        label: 'Queue offline',
        onClick: () => queueUpload(metadata, file),
      },
    });
  }
}
```

### Checking Queue Status

```typescript
import { getQueuedUploads } from '@/lib/offline-uploads';

function UploadStatus() {
  const queued = getQueuedUploads();

  return (
    <div>
      {queued.length > 0 && (
        <p>{queued.length} uploads queued for sync</p>
      )}
    </div>
  );
}
```

### Manual Sync Trigger

```typescript
import { flushQueuedUploads } from '@/lib/offline-uploads';

async function syncNow() {
  await flushQueuedUploads(
    async (payload) => {
      // Your upload logic
      await uploadToServer(payload.metadata, payload.fileData);
    },
    (payload, status) => {
      if (status === 'success') {
        console.log(`Synced: ${payload.fileName}`);
      } else {
        console.error(`Failed: ${payload.fileName}`);
      }
    }
  );
  // Toast notifications automatically shown!
}
```

### Auto-Sync on Connection

Already configured! When user goes from offline → online, queue automatically syncs.

To listen for retries:

```typescript
useEffect(() => {
  const handleRetry = () => {
    flushQueuedUploads(uploadFunction);
  };

  window.addEventListener('retry-offline-uploads', handleRetry);
  return () => window.removeEventListener('retry-offline-uploads', handleRetry);
}, []);
```

---

## 🎨 Styling Animations

### Tailwind Animations (Added)

```tsx
// Slide up (used in PWA prompt)
<div className="animate-slide-up">
  Content slides up from bottom
</div>

// Fade in
<div className="animate-fade-in">
  Content fades in
</div>
```

### Custom Animations

```tsx
// In your CSS/Tailwind
<div className="transition-all duration-300 hover:scale-105">
  Scales on hover
</div>

<div className="transition-colors duration-200 hover:bg-blue-100">
  Color transition
</div>
```

---

## 🧪 Testing Enhancements

### Test Toast Notifications

Visit: `http://localhost:3000/enhancements-demo`

Or in your code:

```typescript
import { toast } from 'sonner';

// Test all variants
function TestToasts() {
  return (
    <>
      <button onClick={() => toast.success('Success!')}>
        Test Success
      </button>
      <button onClick={() => toast.error('Error!')}>
        Test Error
      </button>
      <button onClick={() => toast.info('Info!')}>
        Test Info
      </button>
      <button onClick={() => toast.warning('Warning!')}>
        Test Warning
      </button>
    </>
  );
}
```

### Test Keyboard Shortcuts

1. Press `?` → Should show help modal
2. Press `/` → Should focus search input
3. Press `n` → Should navigate to /upload
4. Press `h` → Should navigate to home
5. Press `Esc` → Should close any open modal

### Test PWA Install

```bash
# Clear all PWA-related storage
localStorage.removeItem('visit-count');
localStorage.removeItem('pwa-prompt-dismissed');
localStorage.removeItem('pwa-installed');

# Reload page twice
# On 2nd reload, wait 3 seconds → Prompt should appear
```

### Test Offline Queue

```bash
# Open Chrome DevTools
# Network tab → Go offline

# Upload an image
# Should see "Upload queued for sync" toast

# Go online
# Should see "Syncing..." → "Success!" toasts
```

---

## 📚 Common Patterns

### Form Submission with Toast

```typescript
async function handleSubmit(data: FormData) {
  try {
    await api.submit(data);
    toast.success('Form submitted', {
      description: 'Your data has been saved',
    });
    router.push('/success');
  } catch (error) {
    toast.error('Submission failed', {
      description: error.message,
      action: {
        label: 'Retry',
        onClick: () => handleSubmit(data),
      },
    });
  }
}
```

### Loading State with Toast

```typescript
async function processData() {
  const loadingToast = toast.loading('Processing data...');

  try {
    const result = await api.process();
    toast.dismiss(loadingToast);
    toast.success('Processing complete!', {
      description: `Processed ${result.count} items`,
    });
  } catch (error) {
    toast.dismiss(loadingToast);
    toast.error('Processing failed');
  }
}
```

### Keyboard Navigation in List

```typescript
function ItemList({ items, onSelect }) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(Math.max(0, selectedIndex - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(Math.min(items.length - 1, selectedIndex + 1));
          break;
        case 'Enter':
          e.preventDefault();
          onSelect(items[selectedIndex]);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [selectedIndex, items]);

  return (
    <ul>
      {items.map((item, i) => (
        <li
          key={item.id}
          className={i === selectedIndex ? 'bg-blue-100' : ''}
        >
          {item.name}
        </li>
      ))}
    </ul>
  );
}
```

---

## 🐛 Troubleshooting

### Toast Not Showing

**Check:** Is `<Toaster />` in your layout?

```tsx
// src/app/layout.tsx
import { Toaster } from 'sonner';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Toaster position="top-right" richColors closeButton />
        {children}
      </body>
    </html>
  );
}
```

### Keyboard Shortcut Not Working

**Check:** Is input focused?

Shortcuts are disabled when typing in inputs/textareas. This is intentional to avoid conflicts.

**Check:** Is `GlobalShortcutsProvider` added?

```tsx
// Should be in root layout
<GlobalShortcutsProvider />
```

### PWA Prompt Not Showing

**Check:** Visit count

```javascript
console.log(localStorage.getItem('visit-count')); // Should be >= 1
```

**Check:** Browser support

PWA `beforeinstallprompt` only works in Chrome/Edge on desktop and Android.

**Check:** Dismissed state

```javascript
console.log(localStorage.getItem('pwa-prompt-dismissed')); // Should be null
console.log(localStorage.getItem('pwa-installed')); // Should be null
```

### Offline Queue Not Syncing

**Check:** Online event listener

```javascript
window.addEventListener('online', () => {
  console.log('Online event fired');
});
```

**Check:** Queue contents

```javascript
import { getQueuedUploads } from '@/lib/offline-uploads';
console.log(getQueuedUploads());
```

---

## 📖 Learn More

- **Full Documentation:** `/docs/reviews/UX_ENHANCEMENTS_IMPLEMENTATION.md`
- **Interactive Demo:** `http://localhost:3000/enhancements-demo`
- **Sonner Docs:** https://sonner.emilkowal.ski/
- **Keyboard Patterns:** https://www.w3.org/WAI/ARIA/apg/patterns/

---

## 💡 Tips

1. **Toast Durations:**
   - Success: 3000ms (3 sec)
   - Error: 5000ms (5 sec) + action button
   - Info: 4000ms (4 sec)
   - Warning: 5000ms (5 sec)

2. **Keyboard Shortcuts:**
   - Single letters (a, n, h) - No modifiers
   - Special keys (/, ?) - May require Shift
   - Combinations (Ctrl+K) - Plan for future

3. **PWA Prompt:**
   - Don't show on first visit (annoying)
   - Wait 3+ seconds after page load
   - Respect user's "Not now" choice
   - Celebrate install with analytics event

4. **Offline Queue:**
   - Always show feedback (toast)
   - Auto-retry on connection restore
   - Provide manual retry button
   - Handle partial failures gracefully

---

**Happy coding! 🚀**

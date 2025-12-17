# Environment Variables for Mobile Features

## Push Notifications

Add these VAPID keys to your environment files:

### Frontend (.env.local)

```env
# Public VAPID key (safe to expose to clients)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BElxhpt18ThIRqB2SxIShTi8AOrsQFP0u9eLBJEr9s-hzaoacMWsq-XSH0zgZXR5lBhe36P75alTPA-qXZPn-TU
```

### Backend (.env)

```env
# Private VAPID key (keep secret!)
VAPID_PRIVATE_KEY=zn2JQDGe0YC0L75BW-6LSTnnCxrQmBogn-VBvjngxZY

# VAPID claims (change to your email)
VAPID_SUBJECT=mailto:admin@impactdatabase.com
```

## Installation

### Frontend

The VAPID public key is already configured above. No additional packages needed.

### Backend

Install the pywebpush package for sending push notifications:

```bash
docker exec -it impact-database-api-1 pip install pywebpush
```

Or add to `requirements.txt`:

```txt
pywebpush==1.14.0
```

## Testing

### 1. Test Push Subscription (Frontend)

Open browser console and run:

```javascript
// Initialize push notifications
const { initializePushNotifications } = await import('@/lib/push-notifications');
const result = await initializePushNotifications();
console.log('Push init result:', result);
```

### 2. Test Backend Endpoint

```bash
# Save subscription (will be called by frontend automatically)
curl -X POST http://localhost:8000/api/user/push-subscription \
  -H "Content-Type: application/json" \
  -H "Cookie: your-auth-cookie" \
  -d '{
    "endpoint": "https://fcm.googleapis.com/...",
    "keys": {
      "p256dh": "...",
      "auth": "..."
    }
  }'

# Send test notification
curl -X POST http://localhost:8000/api/user/push-notification/test \
  -H "Cookie: your-auth-cookie"

# Get user's subscriptions
curl http://localhost:8000/api/user/push-subscription \
  -H "Cookie: your-auth-cookie"

# Delete all subscriptions
curl -X DELETE http://localhost:8000/api/user/push-subscription \
  -H "Cookie: your-auth-cookie"
```

## Database Setup

The `push_subscriptions` table will be created automatically when the API starts.

Table schema:
- `id`: Primary key
- `user_id`: Foreign key to users table
- `endpoint`: Push service endpoint URL
- `p256dh`: Public key for encryption
- `auth`: Auth secret for encryption
- `created_at`: Subscription creation time
- `last_used`: Last notification sent time

## Security Notes

1. **Private Key**: Never expose `VAPID_PRIVATE_KEY` in frontend code or client-side environment variables
2. **Public Key**: Safe to expose `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (used by browsers to subscribe)
3. **HTTPS Required**: Push notifications only work over HTTPS (or localhost for development)
4. **Permissions**: Users must grant notification permission - handle gracefully if denied

## Troubleshooting

### Push notifications not working

1. Check browser permissions: Settings > Privacy > Notifications
2. Verify HTTPS connection (required for production)
3. Check service worker is registered: DevTools > Application > Service Workers
4. Verify VAPID keys are correct in environment variables
5. Check backend logs for pywebpush errors

### Subscription fails

1. Ensure NEXT_PUBLIC_VAPID_PUBLIC_KEY is set correctly
2. Check browser console for errors
3. Verify service worker is active
4. Test with Chrome DevTools > Application > Push Messaging

### Backend errors

1. Install pywebpush: `pip install pywebpush`
2. Verify VAPID_PRIVATE_KEY is set in backend .env
3. Check database migration ran successfully
4. Look for errors in backend logs

## Notification Triggers (To Implement)

Add these calls in your application logic:

```python
from api.push_notifications import send_push_notification

# When upload is approved
await send_push_notification(
    user_id=uploader_id,
    title="Upload Approved! 🎉",
    body=f"Your image '{image_title}' has been approved",
    data={"url": f"/images/{image_id}"},
    tag="upload-approved",
    db=db
)

# When achievement unlocked
await send_push_notification(
    user_id=user_id,
    title="Achievement Unlocked! 🏆",
    body=f"You earned: {achievement_name}",
    data={"url": "/profile?tab=achievements"},
    tag="achievement",
    db=db
)

# When review feedback received
await send_push_notification(
    user_id=uploader_id,
    title="Review Feedback",
    body=f"A reviewer commented on your upload",
    data={"url": f"/images/{image_id}#reviews"},
    tag="review-feedback",
    db=db
)
```

## Monitoring

Track push notification metrics:

```python
# Get subscription count
subscription_count = db.query(PushSubscription).count()

# Get active subscriptions (used in last 30 days)
from datetime import timedelta
active_subs = db.query(PushSubscription).filter(
    PushSubscription.last_used >= datetime.utcnow() - timedelta(days=30)
).count()

# Get expired subscriptions (clean up)
expired_subs = db.query(PushSubscription).filter(
    PushSubscription.last_used < datetime.utcnow() - timedelta(days=90)
).delete()
```

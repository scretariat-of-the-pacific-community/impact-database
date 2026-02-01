# Password Reset Quick Reference

## 🚀 Quick Start

### For End Users
1. Visit `/auth/login`
2. Click "Forgot your password?"
3. Enter your email address
4. Check your email for reset link
5. Click link and create new password
6. Login with your new password

### For Administrators
All password reset attempts are logged for security auditing:
```bash
# View recent password reset activity
docker-compose exec api tail -f /var/log/app.log | grep "Password reset"
```

## 📍 URLs

- **Request Reset**: `/auth/forgot-password`
- **Reset Password**: `/auth/reset-password?token=xxx`
- **Login Page**: `/auth/login`

## 🔑 API Endpoints

```bash
POST /api/auth/forgot-password
POST /api/auth/reset-password
POST /api/auth/validate-reset-token
```

## 🔒 Security Limits

| Feature | Limit | Purpose |
|---------|-------|---------|
| Reset Requests | 3 per hour per email | Prevent abuse |
| Token Lifetime | 15 minutes | Minimize risk window |
| Token Uses | 1 time only | Prevent reuse |
| Attempts per Token | 5 maximum | Stop brute force |
| Password Length | 8+ characters | Ensure strength |

## 📧 Email Configuration

Check email service is running:
```bash
docker-compose ps | grep celery_worker
```

Test email sending:
```bash
curl -X POST http://localhost:8000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

## 🧪 Testing

### Run Full Test Suite
```bash
python3 test_password_reset.py
```

### Manual Testing Flow
1. Request reset: `curl -X POST http://localhost:8000/api/auth/forgot-password -H "Content-Type: application/json" -d '{"email":"user@test.com"}'`
2. Check database for token: `SELECT password_reset_token FROM users WHERE email = 'user@test.com';`
3. Validate token: `curl -X POST "http://localhost:8000/api/auth/validate-reset-token?token=YOUR_TOKEN"`
4. Reset password: `curl -X POST http://localhost:8000/api/auth/reset-password -H "Content-Type: application/json" -d '{"token":"YOUR_TOKEN","new_password":"NewPass123!"}'`

## 🐛 Troubleshooting

### Problem: Email not received
**Check:**
1. Celery worker running: `docker-compose ps celery_worker`
2. Email config in .env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`
3. Celery logs: `docker-compose logs celery_worker`

### Problem: Invalid token error
**Check:**
1. Token not expired (15 min lifetime)
2. Token not already used
3. Token exists in database
4. No typos in token string

### Problem: Rate limit exceeded
**Solution:**
- Wait 1 hour before trying again
- Or clear rate limit manually (admin only):
  ```python
  # In Python shell or API endpoint
  from api.password_reset import reset_request_tracker
  reset_request_tracker.clear()
  ```

### Problem: Weak password rejected
**Requirements:**
- Minimum 8 characters
- At least 1 uppercase letter (A-Z)
- At least 1 lowercase letter (a-z)
- At least 1 number (0-9)
- At least 1 special character (!@#$%^&*()_+-=[]{};':"|,.<>/?)

## 🔍 Monitoring

### Key Metrics to Track
```bash
# Failed reset attempts
grep "Invalid or expired token" app.log | wc -l

# Successful resets
grep "Password successfully reset" app.log | wc -l

# Rate limit hits
grep "Rate limit exceeded" app.log | wc -l

# Token expiration attempts
grep "expired" app.log | wc -l
```

### Database Queries
```sql
-- Count pending reset tokens
SELECT COUNT(*) FROM users 
WHERE password_reset_token IS NOT NULL 
AND password_reset_expires > NOW();

-- List expired tokens (cleanup)
SELECT username, password_reset_expires 
FROM users 
WHERE password_reset_token IS NOT NULL 
AND password_reset_expires < NOW();

-- Recent password changes
SELECT username, last_password_change 
FROM users 
WHERE last_password_change > NOW() - INTERVAL '24 hours'
ORDER BY last_password_change DESC;
```

## 🛡️ Security Checklist

- [x] Rate limiting enabled
- [x] Token expiration set
- [x] One-time use enforced
- [x] Account enumeration prevented
- [x] Strong passwords required
- [x] All events logged
- [x] Email verification required
- [x] HTTPS recommended (production)

## 🔧 Configuration

Edit `/data/impact-database/app/api/password_reset.py`:

```python
# Adjust security parameters as needed
MAX_RESET_REQUESTS_PER_HOUR = 3  # Lower = more secure, higher = more user-friendly
TOKEN_EXPIRY_MINUTES = 15  # Lower = more secure, higher = more user-friendly
MAX_RESET_ATTEMPTS_PER_TOKEN = 5  # Lower = more secure
```

## 📞 Support

### For Users
- If password reset isn't working, contact your administrator
- Check spam folder for reset email
- Ensure email address is correct
- Wait 1 hour if rate limit reached

### For Developers
- Check logs: `docker-compose logs api`
- Verify database columns exist
- Test Celery workers: `docker-compose ps celery_worker`
- Review [PASSWORD_RESET_WORLDCLASS.md](PASSWORD_RESET_WORLDCLASS.md) for full documentation

## 🚨 Emergency Password Reset

If the web interface fails, admins can reset passwords manually:

```bash
# Method 1: Using Python script
cd /data/impact-database
python3 app/scripts/reset_admin_password.py

# Method 2: Direct database update
docker-compose exec postgis_db psql -U postgres -d impact_db
# Then run: UPDATE users SET password_reset_token = NULL, password_reset_expires = NULL WHERE username = 'targetuser';
```

## ✅ Production Deployment

Before going live:
1. ✅ Set SMTP credentials in `.env`
2. ✅ Test email delivery end-to-end
3. ✅ Enable HTTPS for production
4. ✅ Configure proper logging rotation
5. ✅ Set up monitoring alerts for failed resets
6. ✅ Document internal procedures
7. ✅ Train support staff

---

**Status**: Production Ready
**Version**: 1.0.0
**Last Updated**: 2025-01-13

# Email Service Configuration

The Impact Database includes a fully-featured email notification system that supports multiple backends.

## Backends

### Console (Development)
Default for local development. Emails are logged to the console instead of being sent.

```bash
EMAIL_BACKEND=console
```

### SMTP
Works with any SMTP provider (Gmail, Amazon SES, Mailgun, your own mail server).

```bash
EMAIL_BACKEND=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_USE_TLS=true
EMAIL_FROM_ADDRESS=noreply@yourdomain.com
EMAIL_FROM_NAME=Ocean Portal
```

**Gmail Setup:**
1. Enable 2-Factor Authentication
2. Create an App Password: https://myaccount.google.com/apppasswords
3. Use the App Password as `SMTP_PASSWORD`

**Amazon SES Setup:**
1. Verify your domain in SES
2. Create SMTP credentials in SES console
3. Use `email-smtp.us-east-1.amazonaws.com` (or your region) as `SMTP_HOST`

### SendGrid
Requires a SendGrid account and API key.

```bash
EMAIL_BACKEND=sendgrid
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxx
EMAIL_FROM_ADDRESS=noreply@yourdomain.com
EMAIL_FROM_NAME=Ocean Portal
```

**SendGrid Setup:**
1. Create account at https://sendgrid.com
2. Verify your sender domain
3. Create an API key with "Mail Send" permissions

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `EMAIL_BACKEND` | Backend to use: `smtp`, `sendgrid`, `console` | `console` | No |
| `EMAIL_FROM_ADDRESS` | Default sender email | `noreply@oceanportal.io` | No |
| `EMAIL_FROM_NAME` | Default sender name | `Ocean Portal` | No |
| `SMTP_HOST` | SMTP server hostname | - | If smtp backend |
| `SMTP_PORT` | SMTP server port | `587` | No |
| `SMTP_USER` | SMTP username/email | - | If smtp backend |
| `SMTP_PASSWORD` | SMTP password | - | If smtp backend |
| `SMTP_USE_TLS` | Use TLS encryption | `true` | No |
| `SENDGRID_API_KEY` | SendGrid API key | - | If sendgrid backend |

## Email Types

The system sends the following types of emails:

### Transactional
- **Welcome Email** - Sent when a new user registers
- **Password Reset** - Sent when user requests password reset
- **Upload Approved** - Sent when user's upload is approved by curator
- **Upload Rejected** - Sent with reason when upload is rejected

### Notifications (if enabled in user settings)
- **Achievement Unlocked** - When user earns a new achievement
- **Review Assigned** - When curator is assigned a new review
- **Weekly Digest** - Weekly summary of activity (sent Mondays 9 AM UTC)

## Celery Tasks

Email sending is handled asynchronously via Celery tasks:

- `workers.email_tasks.send_welcome_email`
- `workers.email_tasks.send_upload_approved_email`
- `workers.email_tasks.send_upload_rejected_email`
- `workers.email_tasks.send_achievement_email`
- `workers.email_tasks.send_review_assigned_email`
- `workers.email_tasks.send_password_reset_email`
- `workers.email_tasks.send_weekly_digest_email`
- `workers.email_tasks.send_weekly_digest_all_users` (scheduled task)

## User Preferences

Users can control email notifications via their profile settings:
- Email Notifications: On/Off toggle
- Weekly Digest: On/Off toggle (coming soon)

The system respects user preferences before sending non-essential emails.

## Testing Email

To test email sending in development:

```python
from services.email_service import send_email

# With console backend, this logs to console
send_email(
    to_email="test@example.com",
    to_name="Test User",
    subject="Test Email",
    body_text="This is a test email.",
    body_html="<p>This is a <strong>test</strong> email.</p>"
)
```

## Production Checklist

- [ ] Set `EMAIL_BACKEND` to `smtp` or `sendgrid`
- [ ] Configure SMTP or SendGrid credentials
- [ ] Verify sender domain/email in your email provider
- [ ] Test email delivery before go-live
- [ ] Monitor email delivery rates
- [ ] Set up SPF, DKIM, DMARC records for your domain

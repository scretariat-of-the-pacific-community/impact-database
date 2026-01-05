# Social Media Authentication Setup Guide

## Overview
The Pacific Impact Atlas now uses social media OAuth for authentication instead of SSO, making it accessible to citizen scientists and community members worldwide.

## Supported Providers
- **Google** (recommended for general public)
- **Facebook** (popular in Pacific communities)
- **GitHub** (for technical users and developers)

## Setup Instructions

### 1. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth 2.0 Client ID**
5. Configure consent screen:
   - App name: "Pacific Impact Atlas"
   - User support email: your-email@example.com
   - Authorized domains: your-domain.com
6. Create OAuth client:
   - Application type: **Web application**
   - Authorized JavaScript origins: `http://localhost:3000`, `https://your-domain.com`
   - Authorized redirect URIs: `http://localhost:3000/auth/callback`, `https://your-domain.com/auth/callback`
7. Copy the **Client ID** and add to `.env.local`:
   ```
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   ```

**Scopes needed:** `openid`, `profile`, `email`

### 2. Facebook OAuth Setup

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Click **My Apps** → **Create App**
3. Select **Consumer** app type
4. Fill in app details:
   - App name: "Pacific Impact Atlas"
   - App contact email: your-email@example.com
5. Add **Facebook Login** product
6. Configure OAuth redirect URIs:
   - Valid OAuth Redirect URIs: `http://localhost:3000/auth/callback`, `https://your-domain.com/auth/callback`
7. Go to **Settings** → **Basic**
8. Copy the **App ID** and add to `.env.local`:
   ```
   NEXT_PUBLIC_FACEBOOK_APP_ID=your-app-id
   ```
9. Make app public (under **App Mode** toggle to **Live**)

**Permissions needed:** `email`, `public_profile`

### 3. GitHub OAuth Setup

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in application details:
   - Application name: "Pacific Impact Atlas"
   - Homepage URL: `https://your-domain.com`
   - Authorization callback URL: `http://localhost:3000/auth/callback` (for dev) or `https://your-domain.com/auth/callback` (for prod)
4. Click **Register application**
5. Copy the **Client ID** and add to `.env.local`:
   ```
   NEXT_PUBLIC_GITHUB_CLIENT_ID=your-github-client-id
   ```
6. Generate a **Client Secret** (keep this secure on backend)

**Scopes needed:** `read:user`, `user:email`

## Environment Configuration

Create a `.env.local` file in the `frontend` directory:

```bash
# Social Media OAuth
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
NEXT_PUBLIC_FACEBOOK_APP_ID=your-facebook-app-id
NEXT_PUBLIC_GITHUB_CLIENT_ID=your-github-client-id

# API
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Testing Locally

1. Set up OAuth apps in development mode
2. Add `http://localhost:3000/auth/callback` to all redirect URIs
3. Start the development server: `npm run dev`
4. Visit `http://localhost:3000/auth/login`
5. Test each social login button

## Production Deployment

### Pre-Deployment Checklist
- [ ] Update redirect URIs to production domain
- [ ] Set environment variables in hosting platform
- [ ] Test OAuth flow in production
- [ ] Verify HTTPS is enabled (required for OAuth)
- [ ] Configure CORS on backend API

### Security Considerations

1. **HTTPS Required**: OAuth providers require HTTPS in production
2. **Client IDs are Public**: Client IDs can be exposed in frontend code
3. **Never Expose Client Secrets**: Keep secrets on backend only
4. **PKCE Protection**: We use PKCE (Proof Key for Code Exchange) for additional security
5. **State Parameter**: Random state prevents CSRF attacks

## User Experience Benefits

### vs. SSO/Traditional Auth
- ✅ No password to create or remember
- ✅ One-click access for most users
- ✅ No email verification needed
- ✅ Accessible to anyone with social media
- ✅ Trusted authentication providers

### Citizen Scientists
- They likely already have Google/Facebook accounts
- No technical knowledge required
- Fast onboarding (< 30 seconds)
- Mobile-friendly (works on phones)

## Troubleshooting

### "Redirect URI mismatch" error
- Ensure the callback URL matches exactly in provider settings
- Check for trailing slashes (should not have one)
- Verify protocol (http vs https)

### "Client ID not configured" error
- Environment variable not set correctly
- Check variable name matches exactly: `NEXT_PUBLIC_*`
- Restart dev server after adding env vars

### "Invalid scope" error
- Check scopes in auth provider config
- Verify scopes are enabled in OAuth app settings

### Users can't login
- Check OAuth app is in "Live" mode (Facebook)
- Verify app is enabled (Google)
- Check authorized domains are configured

## Migration from SSO

If migrating existing users:
1. Keep SSO enabled temporarily
2. Add social login options
3. Allow users to link social accounts
4. Gradually phase out SSO
5. Provide migration notice to users

## Support Resources

- **Google OAuth**: https://developers.google.com/identity/protocols/oauth2
- **Facebook Login**: https://developers.facebook.com/docs/facebook-login
- **GitHub OAuth**: https://docs.github.com/en/apps/oauth-apps

## Contact

For setup assistance: support@pacific-impact-atlas.org

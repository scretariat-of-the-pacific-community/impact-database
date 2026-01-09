# HTTPS/SSL Setup Guide for Production

## Overview

This guide covers setting up HTTPS/SSL for the Impact Database in production. SSL/TLS is **required** for:

- ✅ Push Notifications (Web Push API)
- ✅ Camera Access (getUserMedia API)
- ✅ Geolocation API
- ✅ Service Workers / PWA features
- ✅ OAuth/SSO authentication
- ✅ Secure cookie transmission
- ✅ PCI compliance (if handling sensitive data)

---

## Option 1: Nginx Reverse Proxy with Let's Encrypt (Recommended)

### Step 1: Install Nginx and Certbot

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx

# RHEL/CentOS
sudo yum install nginx certbot python3-certbot-nginx
```

### Step 2: Configure Nginx

Create `/etc/nginx/sites-available/impact-database`:

```nginx
# HTTP server - redirects to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com;

    # Let's Encrypt ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Redirect all other traffic to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL Certificate paths (will be created by certbot)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;

    # HSTS (HTTP Strict Transport Security)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Frontend - Next.js
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # WebSocket support (for hot reload in dev)
        proxy_set_header X-Forwarded-Host $server_name;
        proxy_set_header X-Forwarded-Port $server_port;
    }

    # Backend API - FastAPI
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # File upload settings
        client_max_body_size 100M;
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
    }

    # Flower - Celery monitoring (restrict access!)
    location /flower/ {
        proxy_pass http://localhost:5555;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # Require authentication
        auth_basic "Restricted Access";
        auth_basic_user_file /etc/nginx/.htpasswd;
    }

    # MinIO Console (restrict access!)
    location /minio-console/ {
        proxy_pass http://localhost:9021/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # Require authentication
        auth_basic "Restricted Access";
        auth_basic_user_file /etc/nginx/.htpasswd;
    }

    # Static files caching
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:3000;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Logging
    access_log /var/log/nginx/impact-database-access.log;
    error_log /var/log/nginx/impact-database-error.log;
}
```

### Step 3: Enable the Site

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/impact-database /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### Step 4: Obtain SSL Certificate

```bash
# Get certificate with certbot
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Follow the prompts:
# - Enter your email for urgent renewal notices
# - Agree to Terms of Service
# - Choose whether to redirect HTTP to HTTPS (recommended: yes)
```

### Step 5: Auto-Renewal Setup

```bash
# Certbot auto-renewal is set up automatically
# Test renewal process:
sudo certbot renew --dry-run

# Check renewal timer
sudo systemctl status certbot.timer
```

### Step 6: Create Basic Auth for Admin Panels

```bash
# Install apache2-utils
sudo apt install apache2-utils

# Create password file
sudo htpasswd -c /etc/nginx/.htpasswd admin

# Add more users
sudo htpasswd /etc/nginx/.htpasswd another_user
```

---

## Option 2: Caddy Server (Automatic HTTPS)

Caddy automatically obtains and renews SSL certificates from Let's Encrypt.

### Step 1: Install Caddy

```bash
# Ubuntu/Debian
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

### Step 2: Configure Caddyfile

Create `/etc/caddy/Caddyfile`:

```caddy
yourdomain.com www.yourdomain.com {
    # Automatic HTTPS with Let's Encrypt

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "no-referrer-when-downgrade"
    }

    # Frontend
    reverse_proxy localhost:3000

    # Backend API
    handle /api/* {
        reverse_proxy localhost:8000 {
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}
        }
    }

    # Flower (with basic auth)
    handle /flower/* {
        basicauth {
            admin JDJhJDE0JHhYZ... # hash from: caddy hash-password
        }
        reverse_proxy localhost:5555
    }

    # File size limit for uploads
    request_body {
        max_size 100MB
    }

    # Logging
    log {
        output file /var/log/caddy/access.log
    }
}
```

### Step 3: Start Caddy

```bash
# Reload configuration
sudo systemctl reload caddy

# Check status
sudo systemctl status caddy

# View logs
sudo journalctl -u caddy --no-pager | tail -50
```

---

## Option 3: Docker with Traefik (Container-Native)

### docker-compose.traefik.yml

```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v3.0
    container_name: traefik
    restart: unless-stopped
    command:
      - "--api.insecure=false"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@yourdomain.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
      - "./letsencrypt:/letsencrypt"
    networks:
      - web

  frontend:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.frontend.rule=Host(`yourdomain.com`)"
      - "traefik.http.routers.frontend.entrypoints=websecure"
      - "traefik.http.routers.frontend.tls.certresolver=letsencrypt"
      - "traefik.http.services.frontend.loadbalancer.server.port=3000"
      # HTTP to HTTPS redirect
      - "traefik.http.middlewares.redirect-to-https.redirectscheme.scheme=https"
      - "traefik.http.routers.frontend-http.rule=Host(`yourdomain.com`)"
      - "traefik.http.routers.frontend-http.entrypoints=web"
      - "traefik.http.routers.frontend-http.middlewares=redirect-to-https"
    networks:
      - web

  api:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`yourdomain.com`) && PathPrefix(`/api`)"
      - "traefik.http.routers.api.entrypoints=websecure"
      - "traefik.http.routers.api.tls.certresolver=letsencrypt"
      - "traefik.http.services.api.loadbalancer.server.port=8000"
    networks:
      - web

networks:
  web:
    external: true
```

---

## Post-SSL Configuration

### 1. Update Application Environment Variables

```bash
# .env.production
USE_SSL=true
SECURE_COOKIES=true
BACKEND_CORS_ORIGINS=["https://yourdomain.com"]
```

### 2. Update Frontend Environment

```bash
# frontend/.env.local
NEXT_PUBLIC_API_URL=https://yourdomain.com/api/v1
```

### 3. Test SSL Configuration

```bash
# Test SSL grade (A+ is ideal)
https://www.ssllabs.com/ssltest/analyze.html?d=yourdomain.com

# Or use command line
curl -I https://yourdomain.com

# Check certificate expiry
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com | openssl x509 -noout -dates
```

### 4. Enable HSTS Preload (Optional but Recommended)

After SSL is stable for 2+ weeks, submit your domain to the HSTS preload list:
https://hstspreload.org/

---

## Troubleshooting

### Certificate Renewal Issues

```bash
# Check certbot logs
sudo tail -f /var/log/letsencrypt/letsencrypt.log

# Manual renewal
sudo certbot renew --force-renewal

# Check which certificates exist
sudo certbot certificates
```

### Nginx Configuration Errors

```bash
# Test configuration
sudo nginx -t

# View error logs
sudo tail -f /var/log/nginx/error.log

# Check if ports are available
sudo netstat -tulpn | grep :443
```

### Mixed Content Issues

If you see mixed content warnings in browser console:

1. Ensure all API calls use `https://`
2. Check `NEXT_PUBLIC_API_URL` uses `https://`
3. Verify CSP headers allow HTTPS resources
4. Check browser dev tools for specific blocked resources

### Port Already in Use

```bash
# Check what's using port 443
sudo lsof -i :443

# Kill process if needed
sudo kill $(sudo lsof -t -i:443)
```

---

## Security Best Practices

### 1. SSL/TLS Settings Checklist

- ✅ Use TLS 1.2 and 1.3 only (disable TLS 1.0/1.1)
- ✅ Enable HSTS with long max-age
- ✅ Use strong cipher suites
- ✅ Enable OCSP stapling
- ✅ Set up CAA DNS records
- ✅ Configure proper security headers

### 2. Certificate Management

- ✅ Monitor certificate expiry (60 days before)
- ✅ Test auto-renewal monthly
- ✅ Keep renewal contact email up-to-date
- ✅ Use wildcard certs if you have many subdomains
- ✅ Consider EV certificates for high-trust applications

### 3. Nginx Security Headers (Already Included Above)

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
```

### 4. Firewall Configuration

```bash
# Allow only necessary ports
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP (for Let's Encrypt)
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable

# Verify
sudo ufw status
```

---

## Monitoring SSL Health

### 1. Set Up SSL Expiry Alerts

```bash
# Add to cron: /etc/cron.daily/check-ssl-expiry
#!/bin/bash
DOMAIN="yourdomain.com"
DAYS_BEFORE_EXPIRY=30
ALERT_EMAIL="admin@yourdomain.com"

EXPIRY_DATE=$(echo | openssl s_client -servername $DOMAIN -connect $DOMAIN:443 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)
EXPIRY_EPOCH=$(date -d "$EXPIRY_DATE" +%s)
NOW_EPOCH=$(date +%s)
DAYS_LEFT=$(( ($EXPIRY_EPOCH - $NOW_EPOCH) / 86400 ))

if [ $DAYS_LEFT -lt $DAYS_BEFORE_EXPIRY ]; then
    echo "SSL certificate for $DOMAIN expires in $DAYS_LEFT days!" | mail -s "SSL Certificate Expiry Warning" $ALERT_EMAIL
fi
```

### 2. Automated SSL Monitoring Services

- **SSL Labs**: Monthly automated scans
- **Uptime Robot**: Free SSL monitoring
- **StatusCake**: SSL certificate monitoring
- **Prometheus + Grafana**: blackbox_exporter for SSL monitoring

---

## Next Steps

1. ✅ Choose SSL setup method (Nginx recommended for most cases)
2. ✅ Configure reverse proxy with the examples above
3. ✅ Obtain SSL certificate with Let's Encrypt
4. ✅ Update application environment variables
5. ✅ Test SSL grade at SSLLabs
6. ✅ Set up certificate expiry monitoring
7. ✅ Configure firewall rules
8. ✅ Test all application features over HTTPS
9. ✅ Enable HSTS preload after 2 weeks of stability

---

## Quick Reference: Common Commands

```bash
# Nginx
sudo nginx -t                      # Test configuration
sudo systemctl reload nginx        # Reload without downtime
sudo systemctl restart nginx       # Full restart
sudo tail -f /var/log/nginx/error.log  # View errors

# Certbot
sudo certbot renew                 # Renew certificates
sudo certbot certificates          # List certificates
sudo certbot delete --cert-name yourdomain.com  # Delete certificate
sudo certbot renew --dry-run       # Test renewal

# Caddy
sudo systemctl reload caddy        # Reload configuration
sudo caddy validate --config /etc/caddy/Caddyfile  # Test config
sudo journalctl -u caddy -f        # View logs
caddy hash-password                # Generate password hash

# SSL Testing
curl -vI https://yourdomain.com    # Test HTTPS connection
openssl s_client -connect yourdomain.com:443  # Check certificate
nmap --script ssl-enum-ciphers -p 443 yourdomain.com  # Check ciphers
```

---

**Document Version:** 1.0
**Last Updated:** December 18, 2025
**Maintained By:** DevOps Team

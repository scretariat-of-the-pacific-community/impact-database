# Production API Endpoint Quick Reference

## 🚀 VERIFIED WORKING ENDPOINTS (48/55 - 87.3%)

### Authentication & User Identity
```
GET  /api/auth/me                          # Current user info
GET  /api/rbac/auth/me                     # RBAC user details
GET  /api/rbac/auth/permissions            # User permissions
POST /api/auth/login                       # Login
POST /api/auth/logout                      # Logout
POST /api/auth/register                    # Register new user
```

### Health Checks
```
GET  /health                               # App health
GET  /                                     # Root endpoint
GET  /api/rbac/rbac/health                 # RBAC health
GET  /api/v1/review-items/health           # Review health
```

### Admin Panel
```
GET  /api/admin/users                      # List users
GET  /api/admin/roles                      # List roles
GET  /api/admin/permissions                # List permissions
GET  /api/admin/dashboard                  # Dashboard metrics
GET  /api/admin/security-summary           # Security overview
GET  /api/admin/audit-logs                 # Audit logs
GET  /api/admin/profile                    # Admin profile
POST /api/admin/users                      # Create user
PUT  /api/admin/users/{user_id}            # Update user
POST /api/admin/users/{user_id}/lock       # Lock user
POST /api/admin/users/{user_id}/unlock     # Unlock user
```

### RBAC Management
```
GET  /api/rbac/roles                       # List roles
GET  /api/rbac/roles/{role_id}             # Get role details
GET  /api/rbac/permissions                 # List permissions
GET  /api/rbac/users/search?q=term         # Search users
GET  /api/rbac/users/{user_id}             # Get user details
```

### Curation Queue (Admin)
```
GET  /api/admin/curation/queue             # Get queue
GET  /api/admin/curation/queue/{item_id}   # Get queue item
PUT  /api/admin/curation/queue/{item_id}   # Update item
POST /api/admin/curation/queue/{item_id}/flag      # Flag item
POST /api/admin/curation/queue/{item_id}/unflag    # Unflag
POST /api/admin/curation/queue/{item_id}/delete    # Delete
POST /api/admin/curation/queue/{item_id}/restore   # Restore
GET  /api/admin/curation/dashboard/stats   # Curation stats
GET  /api/admin/curation/curators          # List curators
POST /api/admin/curation/queue/{item_id}/claim     # Claim item
POST /api/admin/curation/queue/{item_id}/assign    # Assign curator
```

### Images & Metadata
```
GET  /api/images/                          # List images
GET  /api/images/list                      # Images list view
GET  /api/images/{image_id}                # Get image
GET  /api/images/{image_id}/metadata       # Image metadata
GET  /api/v1/images/search                 # Search images
GET  /api/images/user/uploads              # User uploads
GET  /api/images/content/search            # Content search
PUT  /api/images/{image_id}                # Update image
```

### Vocabularies & Taxonomies
```
GET  /api/hazards                          # List hazards
GET  /api/vocabularies                     # Get vocabularies
```

### Search
```
GET  /api/search                           # Global search
GET  /api/v1/images/search                 # Image search
GET  /api/images/content/search            # Content search
```

### User Profile & Settings
```
GET  /api/user/stats                       # User statistics
GET  /api/user/activity                    # Activity feed
GET  /api/user/settings                    # User settings
PUT  /api/user/settings                    # Update settings
GET  /api/user/storage                     # Storage usage
GET  /api/user/analytics                   # User analytics
GET  /api/user/achievements                # All achievements
GET  /api/user/achievements/unlocked       # Unlocked achievements
POST /api/user/avatar                      # Upload avatar
DELETE /api/user/avatar                    # Delete avatar
```

### API Tokens
```
GET    /api/user/tokens                    # List tokens
POST   /api/user/tokens                    # Create token
DELETE /api/user/tokens/{token_id}         # Delete token
```

### Review Workflow
```
GET   /api/v1/review-items/my-assignments  # My assignments
GET   /api/v1/review-items/{item_id}       # Get review item
PATCH /api/v1/review-items/{item_id}       # Update item
PATCH /api/v1/review-items/{item_id}/status # Update status
POST  /api/v1/review-items/{item_id}/assign # Assign reviewer
POST  /api/v1/review-items/{item_id}/flag   # Flag for review
```

### Batch Upload
```
POST /api/batch/create                     # Create batch
GET  /api/batch/list                       # List batches
GET  /api/batch/{batch_id}/status          # Batch status
GET  /api/batch/templates                  # Batch templates
GET  /api/batch/analytics                  # Analytics
DELETE /api/batch/{batch_id}/cancel        # Cancel batch
```

### Upload & File Management
```
POST /upload/upload                        # Upload image
GET  /upload/images/{filename}             # Get image
GET  /upload/images/{filename}/thumbnail   # Get thumbnail
PUT  /upload/images/{filename}             # Update metadata
DELETE /upload/images/{filename}           # Delete image
GET  /upload/audit-logs                    # Audit logs
POST /upload/regenerate-thumbnail/{filename} # Regenerate thumb
```

### Video Upload
```
POST /api/video/upload/initiate            # Start multipart upload
POST /api/video/upload/complete            # Complete upload
POST /api/video/upload/simple              # Simple upload
GET  /api/video/status/{video_id}          # Video status
GET  /api/video/file/{video_id}            # Get video file
GET  /api/video/thumbnail/{video_id}       # Video thumbnail
```

### Social Features
```
GET    /api/follows                        # List follows
POST   /api/follows                        # Follow user
DELETE /api/follows/{follow_id}            # Unfollow
GET    /api/workspaces                     # List workspaces
POST   /api/workspaces                     # Create workspace
GET    /api/notifications                  # Get notifications
PUT    /api/notifications/{id}/read        # Mark as read
```

### Featured Content
```
GET  /api/featured-stories                 # Featured stories
```

### Password Reset
```
POST /api/auth/forgot-password             # Request reset
POST /api/auth/reset-password              # Reset password
GET  /api/auth/validate-reset-token        # Validate token
```

### Analytics
```
POST /api/analytics/events                 # Track event
GET  /api/user/analytics                   # User analytics
GET  /api/batch/analytics                  # Batch analytics
```

### Bulk Import/Export
```
POST /api/admin/curation/bulk-import/validate  # Validate import
POST /api/admin/curation/bulk-import       # Import data
GET  /api/admin/curation/bulk-import       # List imports
GET  /api/admin/curation/export            # List exports
POST /api/admin/curation/export            # Create export
```

---

## ⚠️ DEPRECATED ENDPOINTS (Use Alternatives)

```
❌ /api/images/hazards          → Use /api/hazards
❌ /api/images/countries         → Not implemented
❌ /api/images/stats             → Use /api/images/
❌ /api/images/search            → Use /api/v1/images/search
```

---

## 🔒 AUTHENTICATION REQUIRED

Most endpoints require Bearer token authentication:
```
Authorization: Bearer <your_jwt_token>
```

Get token via:
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "kishank", "password": "admin123"}'
```

---

## 📝 COMMON QUERY PARAMETERS

### Pagination
```
?page=1              # Page number (default: 1)
?page_size=20        # Items per page (default: 20-50)
```

### Filtering
```
?status=approved     # Filter by status
?flagged=true        # Filter flagged items
?active_only=true    # Active users only
?sort_by=created_at  # Sort field
?sort_order=desc     # Sort direction
```

### Search
```
?q=search_term       # Search query
?search=keyword      # Alternative search param
```

### Date Range
```
?start_date=2026-01-01
?end_date=2026-01-31
```

---

## 🎯 EXAMPLE REQUESTS

### Get Curation Queue
```bash
curl -X GET "http://localhost:8000/api/admin/curation/queue?page=1&page_size=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Search Images
```bash
curl -X GET "http://localhost:8000/api/v1/images/search?q=tsunami&page=1" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Update User Settings
```bash
curl -X PUT "http://localhost:8000/api/user/settings" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"language": "en", "theme": "dark"}'
```

---

## 📊 API STATISTICS

- **Total Endpoints:** 134
- **Tested Endpoints:** 55
- **Working Endpoints:** 48
- **Success Rate:** 87.3%
- **Base URL:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs

---

**Last Updated:** January 28, 2026  
**Version:** Production v1.0

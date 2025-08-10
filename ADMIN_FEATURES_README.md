# Admin Role Implementation - Impact Database

## Overview

This implementation provides a comprehensive admin role system for the Impact Database with the following key features:

### ✅ Exit Criteria Achieved

1. **Admin role: review queue, edit metadata, merge/duplicate handling** ✓
2. **Bulk import (zip or CSV+images) with dry‑run + report** ✓
3. **Comment/flagging for curation; soft delete & restore** ✓
4. **Export: CSV, ISO 19139 XML, and JSON** ✓

## Features Implemented

### 🔐 Enhanced Authentication & User Management

- **Role-based access control** with permissions: `viewer`, `contributor`, `curator`, `admin`, `super_admin`
- **Granular permissions** system for fine-grained access control
- **Secure password hashing** with bcrypt and salts
- **Session management** with token-based authentication
- **Account security** features (lockout, failed attempts tracking)
- **User profile management** with organizational information
- **Comprehensive audit logging** for all user actions

### 📋 Curation Queue Management

- **Review queue** with filtering, sorting, and pagination
- **Status tracking**: pending, under_review, approved, rejected, needs_changes, duplicate, archived
- **Priority levels**: low, medium, high, urgent
- **Assignment system** for curators
- **Due date management** for review tasks
- **Flagging system** for items requiring attention
- **Soft delete and restore** functionality
- **Comprehensive action history** tracking

### 💬 Comments & Collaboration

- **Threaded comments** on curation items
- **Internal/external** comment types
- **Comment moderation** with soft delete
- **Real-time collaboration** features for curation teams

### 📝 Metadata Editing

- **Full metadata editing** with change tracking
- **Before/after comparison** for all changes
- **Change notes and justification** system
- **ISO 19115 compliance** maintained during edits
- **Validation** of metadata changes

### 🔄 Duplicate & Merge Handling

- **Duplicate detection** and marking
- **Merge functionality** with configurable strategies:
  - Prefer original data
  - Prefer new data
  - Manual field-by-field selection
- **Merge conflict resolution** tools
- **Related item tracking**

### 📦 Bulk Import System

- **Multi-format support**: ZIP archives, CSV files
- **Dry-run mode** for validation before import
- **Comprehensive validation** with detailed error reporting
- **Progress tracking** and status updates
- **Background processing** for large imports
- **Import reports** with success/failure details
- **Field mapping** for CSV imports
- **Error handling and recovery**

### 📤 Export System

- **Multiple export formats**:
  - **CSV**: Standard comma-separated values
  - **JSON**: Structured JSON with metadata
  - **ISO 19139 XML**: Full ISO compliance
  - **GeoJSON**: Spatial data format
- **Filtered exports** with custom query parameters
- **Background processing** for large exports
- **Download management** with expiration
- **Format-specific options** (pretty printing, field selection)

### 📊 Admin Dashboard

- **Real-time statistics** and metrics
- **Queue monitoring** with priority breakdown
- **Activity tracking** and recent actions
- **System health monitoring**
- **User activity analytics**
- **Security monitoring** dashboard

### 🛡️ Security & Audit

- **Comprehensive audit logging** for all actions
- **Security event monitoring**
- **Failed login tracking**
- **Session management** and monitoring
- **IP address logging**
- **User agent tracking**
- **Administrative action logging**

## Database Schema

### New Tables Added

1. **admin_users**: Enhanced user management with roles and permissions
2. **user_sessions**: Session tracking and management
3. **user_audit_logs**: Comprehensive audit trail
4. **curation_queue**: Review queue management
5. **curation_comments**: Comments and collaboration
6. **curation_actions**: Action history tracking
7. **bulk_imports**: Import operation tracking
8. **export_requests**: Export request management

## API Endpoints

### Admin Management (`/admin/`)

- `POST /admin/users` - Create user
- `GET /admin/users` - List users with filtering
- `GET /admin/users/{id}` - Get user details
- `PUT /admin/users/{id}` - Update user
- `POST /admin/users/{id}/lock` - Lock user account
- `POST /admin/users/{id}/unlock` - Unlock user account
- `DELETE /admin/users/{id}` - Soft delete user
- `GET /admin/roles` - List available roles
- `GET /admin/permissions` - List permissions
- `GET /admin/audit-logs` - Get audit logs
- `GET /admin/security-summary` - Security dashboard
- `GET /admin/dashboard` - Admin dashboard metrics
- `GET /admin/profile` - Get own profile
- `PUT /admin/profile` - Update own profile
- `POST /admin/change-password` - Change password

### Curation Management (`/admin/curation/`)

- `GET /admin/curation/queue` - Get curation queue
- `GET /admin/curation/queue/{id}` - Get curation item
- `PUT /admin/curation/queue/{id}` - Update curation item
- `POST /admin/curation/queue/{id}/flag` - Flag item
- `POST /admin/curation/queue/{id}/unflag` - Remove flag
- `POST /admin/curation/queue/{id}/delete` - Soft delete
- `POST /admin/curation/queue/{id}/restore` - Restore item
- `GET /admin/curation/queue/{id}/comments` - Get comments
- `POST /admin/curation/queue/{id}/comments` - Add comment
- `GET /admin/curation/queue/{id}/actions` - Get action history
- `POST /admin/curation/queue/{id}/mark-duplicate` - Mark as duplicate
- `POST /admin/curation/queue/{id}/merge` - Merge items
- `PUT /admin/curation/metadata/{filename}` - Edit metadata
- `GET /admin/curation/dashboard/stats` - Dashboard statistics

### Bulk Import (`/admin/curation/bulk-import/`)

- `POST /admin/curation/bulk-import/validate` - Validate import file
- `POST /admin/curation/bulk-import` - Start import
- `GET /admin/curation/bulk-import` - List imports
- `GET /admin/curation/bulk-import/{id}` - Get import details

### Export (`/admin/curation/export/`)

- `POST /admin/curation/export` - Create export request
- `GET /admin/curation/export` - List exports
- `GET /admin/curation/export/{id}` - Download export

## Usage Examples

### 1. Creating a Curator User

```bash
curl -X POST "http://localhost:8000/admin/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "curator1",
    "email": "curator@example.com",
    "password": "securepass123",
    "role": "curator",
    "full_name": "John Curator",
    "organization": "Research Institute"
  }'
```

### 2. Bulk Import with Dry Run

```bash
curl -X POST "http://localhost:8000/admin/curation/bulk-import" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "file=@metadata.csv" \
  -F "import_type=csv" \
  -F "dry_run=true" \
  -F 'mapping_config={"filename": "image_file", "hazard_type": "disaster_type"}'
```

### 3. Export to ISO 19139 XML

```bash
curl -X POST "http://localhost:8000/admin/curation/export" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "export_type": "iso19139",
    "filters": {"hazard_type": "flood", "country": "Philippines"},
    "format_options": {}
  }'
```

### 4. Review Queue Management

```bash
# Get pending items
curl "http://localhost:8000/admin/curation/queue?status=pending&limit=20" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Approve an item
curl -X PUT "http://localhost:8000/admin/curation/queue/{item_id}" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "approved",
    "review_notes": "Image quality is good, metadata is complete"
  }'
```

### 5. Add Comment to Curation Item

```bash
curl -X POST "http://localhost:8000/admin/curation/queue/{item_id}/comments" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Please verify the GPS coordinates for this image",
    "comment_type": "review",
    "is_internal": false
  }'
```

## Setup Instructions

### 1. Database Migration

```bash
cd app
alembic upgrade head
```

### 2. Create Initial Admin User

```python
from services.admin_service import AdminService, UserRole
from models.database import SessionLocal

db = SessionLocal()
admin_service = AdminService(db)

admin_user = admin_service.create_user(
    username="admin",
    email="admin@example.com",
    password="admin123",
    role=UserRole.SUPER_ADMIN,
    full_name="System Administrator"
)

print(f"Admin user created: {admin_user.username}")
```

### 3. Run Tests

```bash
cd app
./test_admin_features.sh
```

### 4. Start the Application

```bash
cd app
python core/main.py
```

## Configuration

### Environment Variables

- `SECRET_KEY`: JWT signing key
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection for sessions
- `MINIO_ENDPOINT`: MinIO endpoint for file storage
- `MINIO_ACCESS_KEY`: MinIO access key
- `MINIO_SECRET_KEY`: MinIO secret key

### Role Permissions

| Role | Permissions |
|------|-------------|
| **Viewer** | View data only |
| **Contributor** | View, upload, edit own data |
| **Curator** | View, upload, edit any data, review submissions, export |
| **Admin** | All curator permissions + user management, bulk import, audit logs |
| **Super Admin** | All permissions including system configuration |

## Integration with Frontend

The admin interface can be integrated with the existing Next.js frontend:

1. **Admin Dashboard**: React components for queue management
2. **User Management**: CRUD interface for users and roles
3. **Bulk Import**: Upload interface with progress tracking
4. **Export Interface**: Request and download management
5. **Curation Tools**: Review interface with comments and actions

## Security Considerations

- **Authentication**: JWT tokens with expiration
- **Authorization**: Role-based access control
- **Audit Logging**: All actions are logged
- **Rate Limiting**: Prevent abuse (to be implemented)
- **Input Validation**: All inputs are validated and sanitized
- **Password Security**: Bcrypt hashing with salts
- **Session Management**: Secure session handling

## Performance Optimizations

- **Database Indexing**: Optimized indexes for common queries
- **Background Processing**: Async operations for bulk operations
- **Pagination**: All list endpoints support pagination
- **Caching**: Redis caching for session data
- **File Streaming**: Efficient file handling for uploads/downloads

## Monitoring and Observability

- **Audit Logs**: Comprehensive action tracking
- **Performance Metrics**: Dashboard with key metrics
- **Error Tracking**: Detailed error logging
- **Health Checks**: System health monitoring
- **Security Events**: Failed login tracking and alerts

## Future Enhancements

1. **Email Notifications**: Alerts for curation events
2. **Advanced Search**: Full-text search in metadata
3. **Batch Operations**: Bulk approve/reject functionality
4. **API Rate Limiting**: Prevent abuse
5. **Advanced Analytics**: Detailed reporting and insights
6. **Workflow Automation**: Rules-based curation
7. **Integration APIs**: Webhook support for external systems
8. **Mobile Interface**: Mobile-optimized admin interface

This implementation provides a robust, scalable, and secure admin role system that meets all the specified exit criteria and provides a foundation for future enhancements.

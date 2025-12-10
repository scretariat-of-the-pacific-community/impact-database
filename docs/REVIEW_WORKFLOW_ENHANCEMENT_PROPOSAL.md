# ReviewWorkflow Enhancement Proposal
**Extending Review System with RBAC, Assignments, Audit Trails & Notifications**

## Executive Summary

This document proposes comprehensive enhancements to the ReviewWorkflow system to support:
1. **Role-Based Access Control (RBAC)** with granular permissions
2. **Assignment & Mentioning** system for collaborative review
3. **Comprehensive Audit Trails** for compliance and traceability
4. **Multi-Channel Notifications** (Email, Slack, in-app)
5. **Background Jobs** for async processing

---

## 1. Database Schema Changes

### 1.1 New Tables

#### **`users` Table**
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    password_hash VARCHAR(255) NOT NULL,
    role_id INTEGER REFERENCES roles(id),
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Profile
    avatar_url VARCHAR(500),
    bio TEXT,
    department VARCHAR(100),
    position VARCHAR(100),
    timezone VARCHAR(50) DEFAULT 'UTC',
    language VARCHAR(10) DEFAULT 'en',
    
    -- Preferences
    notification_preferences JSONB DEFAULT '{"email": true, "slack": false, "in_app": true}',
    review_preferences JSONB DEFAULT '{}',
    
    -- Stats
    reviews_completed INTEGER DEFAULT 0,
    avg_review_time_minutes INTEGER,
    
    INDEX idx_users_email (email),
    INDEX idx_users_username (username),
    INDEX idx_users_role (role_id)
);
```

#### **`roles` Table**
```sql
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    level INTEGER NOT NULL, -- Hierarchy: 1=Admin, 2=Senior Reviewer, 3=Reviewer, 4=Contributor
    is_system_role BOOLEAN DEFAULT false, -- Cannot be deleted
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_roles_name (name),
    INDEX idx_roles_level (level)
);

-- Default roles
INSERT INTO roles (name, display_name, description, level, is_system_role) VALUES
('admin', 'Administrator', 'Full system access', 1, true),
('senior_reviewer', 'Senior Reviewer', 'Can review, assign, and approve all items', 2, true),
('reviewer', 'Reviewer', 'Can review assigned items', 3, true),
('contributor', 'Contributor', 'Can submit items for review', 4, true),
('viewer', 'Viewer', 'Read-only access', 5, true);
```

#### **`permissions` Table**
```sql
CREATE TABLE permissions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    resource VARCHAR(50) NOT NULL, -- e.g., 'review_item', 'metadata', 'user'
    action VARCHAR(50) NOT NULL,   -- e.g., 'read', 'create', 'update', 'delete', 'approve'
    description TEXT,
    
    INDEX idx_permissions_resource (resource),
    INDEX idx_permissions_action (action)
);

-- Permission examples
INSERT INTO permissions (name, resource, action, description) VALUES
('review:read', 'review_item', 'read', 'View review items'),
('review:create', 'review_item', 'create', 'Create review items'),
('review:update', 'review_item', 'update', 'Edit review items'),
('review:approve', 'review_item', 'approve', 'Approve review items'),
('review:reject', 'review_item', 'reject', 'Reject review items'),
('review:assign', 'review_item', 'assign', 'Assign items to reviewers'),
('review:flag', 'review_item', 'flag', 'Flag items for attention'),
('metadata:read', 'metadata', 'read', 'View metadata'),
('metadata:update', 'metadata', 'update', 'Edit metadata'),
('user:manage', 'user', 'manage', 'Manage users and roles'),
('audit:view', 'audit', 'read', 'View audit logs'),
('notification:send', 'notification', 'send', 'Send notifications to users');
```

#### **`role_permissions` Table (Many-to-Many)**
```sql
CREATE TABLE role_permissions (
    role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    PRIMARY KEY (role_id, permission_id),
    INDEX idx_role_permissions_role (role_id),
    INDEX idx_role_permissions_permission (permission_id)
);
```

#### **`review_items` Table (Enhanced)**
```sql
CREATE TABLE review_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id UUID REFERENCES image_metadata(id) ON DELETE CASCADE,
    
    -- Status & Priority
    status VARCHAR(50) DEFAULT 'pending',
    -- pending, under_review, approved, rejected, needs_changes, duplicate, archived
    priority VARCHAR(20) DEFAULT 'medium', -- low, medium, high, urgent
    
    -- Assignment
    assigned_to UUID REFERENCES users(id),
    assigned_at TIMESTAMP WITH TIME ZONE,
    assigned_by UUID REFERENCES users(id),
    
    -- Submission Info
    submitted_by UUID REFERENCES users(id) NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Review Info
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewer_notes TEXT,
    
    -- Flagging
    is_flagged BOOLEAN DEFAULT false,
    flag_reason TEXT,
    flagged_by UUID REFERENCES users(id),
    flagged_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    title VARCHAR(255),
    description TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Duplicates
    is_duplicate BOOLEAN DEFAULT false,
    duplicate_of UUID REFERENCES review_items(id),
    
    -- Timing
    due_date TIMESTAMP WITH TIME ZONE,
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Workflow tracking
    workflow_state JSONB DEFAULT '{}', -- Stores state machine data
    review_duration_minutes INTEGER, -- Auto-calculated on completion
    
    INDEX idx_review_items_status (status),
    INDEX idx_review_items_assigned_to (assigned_to),
    INDEX idx_review_items_submitted_by (submitted_by),
    INDEX idx_review_items_priority (priority),
    INDEX idx_review_items_flagged (is_flagged),
    INDEX idx_review_items_due_date (due_date)
);
```

#### **`review_assignments` Table (Assignment History)**
```sql
CREATE TABLE review_assignments (
    id SERIAL PRIMARY KEY,
    review_item_id UUID REFERENCES review_items(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES users(id),
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    unassigned_at TIMESTAMP WITH TIME ZONE,
    reason VARCHAR(50), -- auto, manual, reassigned, escalated
    notes TEXT,
    
    INDEX idx_review_assignments_item (review_item_id),
    INDEX idx_review_assignments_assigned_to (assigned_to),
    INDEX idx_review_assignments_assigned_at (assigned_at)
);
```

#### **`mentions` Table**
```sql
CREATE TABLE mentions (
    id SERIAL PRIMARY KEY,
    review_item_id UUID REFERENCES review_items(id) ON DELETE CASCADE,
    comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    mentioned_user_id UUID REFERENCES users(id),
    mentioned_by UUID REFERENCES users(id),
    mentioned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    
    INDEX idx_mentions_user (mentioned_user_id),
    INDEX idx_mentions_item (review_item_id),
    INDEX idx_mentions_unread (mentioned_user_id, is_read)
);
```

#### **`comments` Table (Enhanced)**
```sql
CREATE TABLE comments (
    id SERIAL PRIMARY KEY,
    review_item_id UUID REFERENCES review_items(id) ON DELETE CASCADE,
    parent_comment_id INTEGER REFERENCES comments(id), -- For threaded comments
    
    author_id UUID REFERENCES users(id),
    content TEXT NOT NULL,
    
    -- Visibility
    is_internal BOOLEAN DEFAULT false, -- Internal team notes vs public
    visibility VARCHAR(20) DEFAULT 'team', -- team, public, private
    
    -- Rich content
    attachments JSONB DEFAULT '[]', -- [{url, filename, type}]
    mentions JSONB DEFAULT '[]', -- [@user_id]
    
    -- Status
    is_edited BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    edited_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_comments_review_item (review_item_id),
    INDEX idx_comments_author (author_id),
    INDEX idx_comments_created_at (created_at)
);
```

#### **`notifications` Table**
```sql
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    recipient_id UUID REFERENCES users(id),
    
    -- Notification Type
    type VARCHAR(50) NOT NULL, 
    -- assignment, mention, status_change, comment, flag, escalation, due_date, approval
    
    -- Content
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    action_url VARCHAR(500),
    
    -- Reference
    review_item_id UUID REFERENCES review_items(id),
    comment_id INTEGER REFERENCES comments(id),
    triggered_by UUID REFERENCES users(id),
    
    -- Delivery Status
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    
    email_sent BOOLEAN DEFAULT false,
    email_sent_at TIMESTAMP WITH TIME ZONE,
    email_error TEXT,
    
    slack_sent BOOLEAN DEFAULT false,
    slack_sent_at TIMESTAMP WITH TIME ZONE,
    slack_error TEXT,
    
    push_sent BOOLEAN DEFAULT false,
    push_sent_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE, -- Auto-delete old notifications
    
    INDEX idx_notifications_recipient (recipient_id),
    INDEX idx_notifications_type (type),
    INDEX idx_notifications_unread (recipient_id, is_read),
    INDEX idx_notifications_created_at (created_at)
);
```

#### **`notification_preferences` Table**
```sql
CREATE TABLE notification_preferences (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) UNIQUE,
    
    -- Channel preferences
    email_enabled BOOLEAN DEFAULT true,
    slack_enabled BOOLEAN DEFAULT false,
    in_app_enabled BOOLEAN DEFAULT true,
    push_enabled BOOLEAN DEFAULT false,
    
    -- Frequency
    digest_mode VARCHAR(20) DEFAULT 'instant', -- instant, hourly, daily, weekly
    quiet_hours_start TIME, -- e.g., '22:00:00'
    quiet_hours_end TIME,   -- e.g., '08:00:00'
    
    -- Event-specific preferences
    notify_on_assignment BOOLEAN DEFAULT true,
    notify_on_mention BOOLEAN DEFAULT true,
    notify_on_comment BOOLEAN DEFAULT true,
    notify_on_status_change BOOLEAN DEFAULT true,
    notify_on_flag BOOLEAN DEFAULT true,
    notify_on_due_date BOOLEAN DEFAULT true,
    
    -- Digest summary
    last_digest_sent_at TIMESTAMP WITH TIME ZONE,
    
    -- Slack integration
    slack_webhook_url VARCHAR(500),
    slack_channel VARCHAR(100),
    slack_user_id VARCHAR(100),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### **`review_audit_trail` Table (Enhanced from audit_logs)**
```sql
CREATE TABLE review_audit_trail (
    id SERIAL PRIMARY KEY,
    review_item_id UUID REFERENCES review_items(id) ON DELETE CASCADE,
    
    -- Action Details
    action VARCHAR(50) NOT NULL,
    -- created, updated, status_changed, assigned, unassigned, flagged, commented,
    -- approved, rejected, metadata_updated, duplicate_marked
    
    actor_id UUID REFERENCES users(id),
    actor_name VARCHAR(255),
    actor_role VARCHAR(50),
    
    -- Change Details
    field_changed VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    change_summary JSONB, -- Full before/after snapshot
    
    -- Context
    reason TEXT,
    notes TEXT,
    source VARCHAR(50) DEFAULT 'web', -- web, api, background_job, system
    
    -- Request metadata
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    request_id VARCHAR(255),
    api_endpoint VARCHAR(255),
    
    -- Timing
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processing_duration_ms INTEGER,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    INDEX idx_audit_review_item (review_item_id),
    INDEX idx_audit_actor (actor_id),
    INDEX idx_audit_action (action),
    INDEX idx_audit_timestamp (timestamp)
);
```

#### **`background_jobs` Table**
```sql
CREATE TABLE background_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type VARCHAR(100) NOT NULL,
    -- send_notification, send_digest, check_due_dates, auto_assign, 
    -- duplicate_detection, export_report, cleanup
    
    status VARCHAR(20) DEFAULT 'pending',
    -- pending, running, completed, failed, cancelled, retrying
    
    priority INTEGER DEFAULT 0, -- Higher = more priority
    
    -- Payload
    payload JSONB NOT NULL,
    result JSONB,
    error_message TEXT,
    error_stack TEXT,
    
    -- Execution
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    scheduled_for TIMESTAMP WITH TIME ZONE, -- Delayed execution
    
    -- Retry logic
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    
    -- Worker info
    worker_id VARCHAR(100),
    worker_hostname VARCHAR(255),
    
    -- Metadata
    created_by UUID REFERENCES users(id),
    related_review_item_id UUID REFERENCES review_items(id),
    
    INDEX idx_jobs_status (status),
    INDEX idx_jobs_type (job_type),
    INDEX idx_jobs_scheduled (scheduled_for),
    INDEX idx_jobs_priority (priority)
);
```

#### **`email_templates` Table**
```sql
CREATE TABLE email_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT NOT NULL,
    
    -- Variables available: {{user_name}}, {{review_item_title}}, {{action_url}}, etc.
    variables JSONB DEFAULT '[]',
    
    is_active BOOLEAN DEFAULT true,
    category VARCHAR(50), -- assignment, notification, digest, etc.
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 2. API Schema Changes

### 2.1 New REST Endpoints

#### **Authentication & Authorization**
```
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/refresh
GET    /api/v1/auth/me
POST   /api/v1/auth/register
POST   /api/v1/auth/verify-email
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/reset-password
```

#### **Users**
```
GET    /api/v1/users                    # List users (admin only)
POST   /api/v1/users                    # Create user (admin only)
GET    /api/v1/users/{user_id}          # Get user profile
PUT    /api/v1/users/{user_id}          # Update user
DELETE /api/v1/users/{user_id}          # Delete user (admin only)
GET    /api/v1/users/search             # Search users by name/email
GET    /api/v1/users/{user_id}/stats    # User statistics
```

#### **Roles & Permissions**
```
GET    /api/v1/roles                    # List all roles
POST   /api/v1/roles                    # Create role (admin only)
GET    /api/v1/roles/{role_id}          # Get role details
PUT    /api/v1/roles/{role_id}          # Update role (admin only)
DELETE /api/v1/roles/{role_id}          # Delete role (admin only)
GET    /api/v1/roles/{role_id}/permissions  # List role permissions
POST   /api/v1/roles/{role_id}/permissions  # Add permission to role
DELETE /api/v1/roles/{role_id}/permissions/{permission_id}  # Remove permission
GET    /api/v1/permissions              # List all permissions
```

#### **Review Items (Enhanced)**
```
GET    /api/v1/review-items                          # List with filters
POST   /api/v1/review-items                          # Create new review
GET    /api/v1/review-items/{id}                     # Get details
PUT    /api/v1/review-items/{id}                     # Update
DELETE /api/v1/review-items/{id}                     # Delete
PATCH  /api/v1/review-items/{id}/status              # Change status
POST   /api/v1/review-items/{id}/assign              # Assign to user
POST   /api/v1/review-items/{id}/unassign            # Unassign
POST   /api/v1/review-items/{id}/flag                # Flag item
POST   /api/v1/review-items/{id}/unflag              # Unflag item
POST   /api/v1/review-items/{id}/approve             # Approve
POST   /api/v1/review-items/{id}/reject              # Reject
POST   /api/v1/review-items/{id}/request-changes    # Request changes
POST   /api/v1/review-items/{id}/mark-duplicate     # Mark as duplicate
GET    /api/v1/review-items/{id}/audit-trail        # Get audit history
GET    /api/v1/review-items/{id}/comments           # Get comments
POST   /api/v1/review-items/{id}/comments           # Add comment
GET    /api/v1/review-items/my-assignments          # My assigned items
GET    /api/v1/review-items/my-submissions          # My submissions
GET    /api/v1/review-items/stats                   # Statistics
```

#### **Comments**
```
GET    /api/v1/comments/{comment_id}         # Get comment
PUT    /api/v1/comments/{comment_id}         # Edit comment
DELETE /api/v1/comments/{comment_id}         # Delete comment
POST   /api/v1/comments/{comment_id}/reply   # Reply to comment
```

#### **Mentions**
```
GET    /api/v1/mentions                      # List my mentions
GET    /api/v1/mentions/unread              # Unread mentions
PATCH  /api/v1/mentions/{id}/read           # Mark as read
PATCH  /api/v1/mentions/read-all            # Mark all as read
```

#### **Notifications**
```
GET    /api/v1/notifications                 # List notifications
GET    /api/v1/notifications/unread          # Unread notifications
GET    /api/v1/notifications/{id}            # Get notification
PATCH  /api/v1/notifications/{id}/read       # Mark as read
PATCH  /api/v1/notifications/read-all        # Mark all as read
DELETE /api/v1/notifications/{id}            # Delete notification
GET    /api/v1/notifications/preferences     # Get preferences
PUT    /api/v1/notifications/preferences     # Update preferences
POST   /api/v1/notifications/test            # Test notification delivery
```

#### **Audit Trail**
```
GET    /api/v1/audit                         # List audit logs (admin)
GET    /api/v1/audit/{review_item_id}        # Audit for specific item
GET    /api/v1/audit/export                  # Export audit logs
GET    /api/v1/audit/stats                   # Audit statistics
```

#### **Background Jobs**
```
GET    /api/v1/jobs                          # List jobs (admin)
GET    /api/v1/jobs/{job_id}                 # Get job status
POST   /api/v1/jobs/{job_id}/cancel          # Cancel job
POST   /api/v1/jobs/{job_id}/retry           # Retry failed job
```

### 2.2 Request/Response Examples

#### **Assign Review Item**
```http
POST /api/v1/review-items/123e4567-e89b-12d3-a456-426614174000/assign
Authorization: Bearer <token>
Content-Type: application/json

{
  "assigned_to": "user_uuid_here",
  "reason": "expertise_match",
  "notes": "This user has experience with flood imagery",
  "notify": true,
  "priority": "high"
}

Response 200:
{
  "success": true,
  "review_item": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "assigned_to": {
      "id": "user_uuid_here",
      "name": "Jane Reviewer",
      "email": "jane@example.com"
    },
    "assigned_at": "2025-11-10T14:30:00Z",
    "assigned_by": {
      "id": "current_user_uuid",
      "name": "John Admin"
    },
    "status": "under_review"
  },
  "notification_sent": true
}
```

#### **Add Comment with Mention**
```http
POST /api/v1/review-items/123e4567-e89b-12d3-a456-426614174000/comments
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Hey @jane.reviewer, can you take a look at the coordinates? They seem off.",
  "is_internal": true,
  "mentions": ["jane_uuid"],
  "attachments": [
    {
      "url": "https://s3.../screenshot.png",
      "filename": "coordinate_issue.png",
      "type": "image/png"
    }
  ]
}

Response 201:
{
  "id": 456,
  "content": "Hey @jane.reviewer, can you take a look at the coordinates?",
  "author": {
    "id": "current_user_uuid",
    "name": "John Admin",
    "avatar_url": "https://..."
  },
  "mentions": [
    {
      "user_id": "jane_uuid",
      "username": "jane.reviewer",
      "notification_sent": true
    }
  ],
  "attachments": [...],
  "created_at": "2025-11-10T14:35:00Z"
}
```

#### **Get Audit Trail**
```http
GET /api/v1/review-items/123e4567-e89b-12d3-a456-426614174000/audit-trail
Authorization: Bearer <token>

Response 200:
{
  "review_item_id": "123e4567-e89b-12d3-a456-426614174000",
  "total_events": 15,
  "events": [
    {
      "id": 1001,
      "action": "status_changed",
      "actor": {
        "id": "user_uuid",
        "name": "Jane Reviewer",
        "role": "senior_reviewer"
      },
      "changes": {
        "status": {
          "old": "under_review",
          "new": "approved"
        }
      },
      "notes": "All metadata verified. Coordinates accurate.",
      "timestamp": "2025-11-10T15:00:00Z",
      "ip_address": "192.168.1.100",
      "source": "web"
    },
    {
      "id": 1000,
      "action": "assigned",
      "actor": {
        "id": "admin_uuid",
        "name": "John Admin",
        "role": "admin"
      },
      "changes": {
        "assigned_to": {
          "old": null,
          "new": "jane_uuid"
        }
      },
      "timestamp": "2025-11-10T14:30:00Z"
    }
  ]
}
```

---

## 3. UI States & Components

### 3.1 New UI Components

#### **PermissionGate Component**
```tsx
<PermissionGate permission="review:approve">
  <button onClick={handleApprove}>Approve</button>
</PermissionGate>

<PermissionGate role="senior_reviewer" fallback={<div>Access Denied</div>}>
  <AdminPanel />
</PermissionGate>
```

#### **UserPicker Component**
```tsx
<UserPicker
  onSelect={(user) => handleAssign(user)}
  filter={(user) => user.role === 'reviewer'}
  placeholder="Search reviewers..."
/>
```

#### **MentionInput Component**
```tsx
<MentionInput
  value={comment}
  onChange={setComment}
  onMention={(users) => handleMentions(users)}
  suggestions={availableUsers}
/>
```

#### **NotificationBell Component**
```tsx
<NotificationBell
  unreadCount={5}
  onNotificationClick={(notif) => navigate(notif.action_url)}
  onMarkAllRead={handleMarkAllRead}
/>
```

#### **AuditTrail Component**
```tsx
<AuditTrail
  reviewItemId={itemId}
  filter="status_change"
  showDetails={true}
/>
```

### 3.2 UI State Management

#### **Review Item States**
```typescript
interface ReviewItemState {
  // Data
  item: ReviewItem | null;
  loading: boolean;
  error: string | null;
  
  // Permissions
  canEdit: boolean;
  canApprove: boolean;
  canAssign: boolean;
  canFlag: boolean;
  
  // UI State
  activeTab: 'review' | 'metadata' | 'comments' | 'audit' | 'duplicates';
  showAssignModal: boolean;
  showFlagModal: boolean;
  showNotificationPreview: boolean;
  
  // Assignment
  assignedUser: User | null;
  assignmentReason: string;
  
  // Comments
  comments: Comment[];
  newComment: string;
  mentionedUsers: string[];
  
  // Audit
  auditEvents: AuditEvent[];
  auditFilter: string;
  
  // Notifications
  unreadNotifications: number;
  notificationPreferences: NotificationPreferences;
}
```

#### **Permission Checking Hook**
```typescript
const usePermission = (permission: string) => {
  const { user } = useAuth();
  
  return useMemo(() => {
    if (!user || !user.role) return false;
    return user.role.permissions.includes(permission);
  }, [user, permission]);
};

// Usage
const canApprove = usePermission('review:approve');
const canAssign = usePermission('review:assign');
```

### 3.3 New UI Screens

#### **Assignment Modal**
```
┌─────────────────────────────────────┐
│  Assign Review Item                 │
├─────────────────────────────────────┤
│  Assign to:                         │
│  [Search users...]           [v]    │
│  └─ Suggested:                      │
│     ☑ Jane Reviewer (3 pending)     │
│     ☐ Bob Senior (5 pending)        │
│     ☐ Alice Expert (1 pending)      │
│                                      │
│  Priority:                           │
│  ○ Low  ● Medium  ○ High  ○ Urgent  │
│                                      │
│  Due date:                           │
│  [📅 Select date]                   │
│                                      │
│  Reason: [Dropdown]                  │
│  └─ ● Expertise match                │
│     ○ Workload balancing             │
│     ○ Language skills                │
│     ○ Geographic knowledge           │
│                                      │
│  Notes (optional):                   │
│  [Text area...]                      │
│                                      │
│  ☑ Send notification                │
│  ☐ Add to user's priority queue     │
│                                      │
│  [Cancel]           [Assign]         │
└─────────────────────────────────────┘
```

#### **Notification Center**
```
┌─────────────────────────────────────┐
│  🔔 Notifications (5 unread)        │
├─────────────────────────────────────┤
│  Today                              │
│  ● You were mentioned in a comment  │
│    "Hey @you, check coordinates"    │
│    Review #12345 · 2m ago          │
│                                      │
│  ● New assignment: Flood Imagery    │
│    Priority: High · Due: Tomorrow   │
│    Review #12344 · 15m ago         │
│                                      │
│  Yesterday                           │
│  ○ Status changed: Item approved    │
│    Your submission was approved     │
│    Review #12340 · 1d ago          │
│                                      │
│  [Mark all as read] [Settings]       │
└─────────────────────────────────────┘
```

#### **Audit Trail View**
```
┌─────────────────────────────────────────────────┐
│  Audit Trail - Review #12345                    │
├─────────────────────────────────────────────────┤
│  Filters: [All Actions v] [All Users v]         │
│  ──────────────────────────────────────────────│
│  📅 Nov 10, 2025 3:00 PM                        │
│  ✅ Status Changed: approved                     │
│  👤 Jane Reviewer (Senior Reviewer)             │
│  📝 "All metadata verified. Coordinates accurate│
│  🌐 IP: 192.168.1.100                           │
│  └─ Old: under_review → New: approved           │
│                                                  │
│  📅 Nov 10, 2025 2:30 PM                        │
│  👥 Assigned to Jane Reviewer                   │
│  👤 John Admin (Administrator)                  │
│  📝 "Expertise match - flood specialist"        │
│                                                  │
│  📅 Nov 10, 2025 2:15 PM                        │
│  💬 Comment added                                │
│  👤 Bob Senior (Senior Reviewer)                │
│  📝 "Mentioned @jane.reviewer"                   │
│                                                  │
│  📅 Nov 10, 2025 1:00 PM                        │
│  ✏️ Metadata updated                             │
│  👤 Alice Contributor (Contributor)             │
│  └─ 3 fields changed (expand details)           │
│                                                  │
│  [Export CSV] [Export JSON]                     │
└─────────────────────────────────────────────────┘
```

---

## 4. Background Jobs

### 4.1 Job Types & Handlers

#### **Job Queue Architecture**
```
┌─────────────────────────────────────────────────┐
│  Celery/Redis Job Queue                         │
├─────────────────────────────────────────────────┤
│                                                  │
│  Workers:                                        │
│  • notification_worker (3 instances)            │
│  • digest_worker (1 instance)                   │
│  • maintenance_worker (1 instance)              │
│  • assignment_worker (2 instances)              │
│                                                  │
│  Queues:                                         │
│  • high_priority (notifications, assignments)   │
│  • normal (background tasks)                    │
│  • low (cleanup, analytics)                     │
│                                                  │
└─────────────────────────────────────────────────┘
```

#### **Job Definitions**

**1. Send Notification Job**
```python
@celery.task(bind=True, max_retries=3)
def send_notification(self, notification_id: int):
    """
    Send notification via configured channels (email, Slack, in-app)
    
    Payload:
    {
        "notification_id": 123,
        "channels": ["email", "slack", "in_app"],
        "priority": "high"
    }
    """
    try:
        notif = get_notification(notification_id)
        user_prefs = get_user_preferences(notif.recipient_id)
        
        if user_prefs.email_enabled and 'email' in channels:
            send_email(notif)
        
        if user_prefs.slack_enabled and 'slack' in channels:
            send_slack(notif)
        
        # In-app is always created in DB
        mark_notification_created(notification_id)
        
    except Exception as exc:
        # Retry with exponential backoff
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
```

**2. Send Digest Job**
```python
@celery.task
def send_daily_digest():
    """
    Send daily/weekly digest to users who opted in
    
    Runs: Daily at 8 AM user's timezone
    
    Payload:
    {
        "digest_type": "daily",
        "date": "2025-11-10"
    }
    """
    users = get_users_with_digest_enabled('daily')
    
    for user in users:
        # Check quiet hours
        if is_in_quiet_hours(user):
            continue
        
        # Aggregate notifications
        notifications = get_unread_notifications(user.id, since=yesterday())
        
        if notifications:
            send_digest_email(user, notifications)
```

**3. Check Due Dates Job**
```python
@celery.task
def check_due_dates():
    """
    Check for upcoming/overdue review items and notify assignees
    
    Runs: Every hour
    
    Notifications:
    - 24 hours before: "Reminder: Review due tomorrow"
    - At due time: "Review is now due"
    - 1 day overdue: "Review is overdue"
    - 3 days overdue: Escalate to senior reviewer
    """
    # Due in 24 hours
    upcoming = get_reviews_due_within(hours=24)
    for review in upcoming:
        send_notification(review.assigned_to, 'due_soon', review)
    
    # Overdue
    overdue = get_overdue_reviews()
    for review in overdue:
        days_overdue = (now() - review.due_date).days
        
        if days_overdue == 1:
            send_notification(review.assigned_to, 'overdue', review)
        elif days_overdue == 3:
            # Escalate to senior reviewer
            escalate_review(review)
```

**4. Auto-Assignment Job**
```python
@celery.task
def auto_assign_reviews():
    """
    Auto-assign new reviews based on workload balancing
    
    Runs: Every 30 minutes
    
    Logic:
    - Get unassigned items
    - Calculate reviewer workload
    - Match by expertise (hazard type)
    - Consider timezone for due dates
    - Assign with notification
    """
    unassigned = get_unassigned_reviews(status='pending')
    reviewers = get_available_reviewers()
    
    for review in unassigned:
        # Find best reviewer
        best_reviewer = find_best_reviewer(
            review,
            reviewers,
            criteria=['workload', 'expertise', 'timezone']
        )
        
        if best_reviewer:
            assign_review(review.id, best_reviewer.id, reason='auto_balanced')
```

**5. Duplicate Detection Job**
```python
@celery.task
def detect_duplicates():
    """
    Run duplicate detection on new submissions
    
    Runs: On new submission + Daily batch
    
    Algorithm:
    - Image similarity (perceptual hash)
    - Metadata similarity (location, date, hazard type)
    - Calculate confidence score
    - Flag potential duplicates (> 80% similarity)
    """
    recent_images = get_recent_submissions(hours=24)
    
    for image in recent_images:
        similar_images = find_similar_images(
            image,
            threshold=0.8,
            check=['image_hash', 'location', 'metadata']
        )
        
        if similar_images:
            mark_potential_duplicate(image.id, similar_images)
            send_notification(
                image.submitted_by,
                'potential_duplicate',
                similar_images
            )
```

**6. Cleanup Job**
```python
@celery.task
def cleanup_old_data():
    """
    Clean up old notifications, audit logs, etc.
    
    Runs: Daily at 2 AM
    
    Actions:
    - Delete read notifications > 30 days
    - Archive completed jobs > 7 days
    - Compress old audit logs > 90 days
    - Clean up expired sessions
    """
    delete_old_notifications(days=30)
    archive_old_jobs(days=7)
    compress_audit_logs(days=90)
    clean_expired_sessions()
```

**7. Export Report Job**
```python
@celery.task
def export_audit_report(user_id: str, filters: dict):
    """
    Generate audit report export
    
    Triggered: On-demand by admin
    
    Formats: CSV, JSON, PDF
    """
    audit_logs = get_audit_logs(filters)
    
    # Generate report
    report_file = generate_report(
        audit_logs,
        format=filters.get('format', 'csv')
    )
    
    # Upload to S3
    report_url = upload_to_storage(report_file)
    
    # Notify user
    send_notification(
        user_id,
        'report_ready',
        {'url': report_url, 'expires_in': '7 days'}
    )
```

### 4.2 Job Scheduling

```python
# celerybeat schedule
CELERY_BEAT_SCHEDULE = {
    'send-daily-digests': {
        'task': 'tasks.send_daily_digest',
        'schedule': crontab(hour=8, minute=0),  # 8 AM daily
    },
    'check-due-dates': {
        'task': 'tasks.check_due_dates',
        'schedule': crontab(minute='*/60'),  # Every hour
    },
    'auto-assign-reviews': {
        'task': 'tasks.auto_assign_reviews',
        'schedule': crontab(minute='*/30'),  # Every 30 min
    },
    'cleanup-old-data': {
        'task': 'tasks.cleanup_old_data',
        'schedule': crontab(hour=2, minute=0),  # 2 AM daily
    },
}
```

---

## 5. Notification System

### 5.1 Email Notifications

#### **SMTP Configuration**
```python
# settings.py
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.getenv('SMTP_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.getenv('SMTP_PORT', 587))
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.getenv('SMTP_USER')
EMAIL_HOST_PASSWORD = os.getenv('SMTP_PASSWORD')
DEFAULT_FROM_EMAIL = os.getenv('FROM_EMAIL', 'noreply@impactdb.org')
```

#### **Email Templates**

**Assignment Notification**
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #3b82f6; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9fafb; }
    .button { background: #3b82f6; color: white; padding: 12px 24px; 
              text-decoration: none; border-radius: 6px; display: inline-block; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Review Assignment</h1>
    </div>
    <div class="content">
      <p>Hi {{user_name}},</p>
      
      <p>You have been assigned a new review item:</p>
      
      <div style="background: white; padding: 15px; border-left: 4px solid #3b82f6; margin: 20px 0;">
        <h3 style="margin-top: 0;">{{review_title}}</h3>
        <p><strong>Hazard Type:</strong> {{hazard_type}}</p>
        <p><strong>Priority:</strong> <span style="color: #ef4444;">{{priority}}</span></p>
        <p><strong>Due Date:</strong> {{due_date}}</p>
        <p><strong>Assigned By:</strong> {{assigned_by}}</p>
      </div>
      
      <p>{{notes}}</p>
      
      <p style="margin-top: 30px;">
        <a href="{{action_url}}" class="button">Review Now</a>
      </p>
      
      <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
        Impact Database · <a href="{{unsubscribe_url}}">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>
```

**Mention Notification**
```html
<p>Hi {{user_name}},</p>

<p><strong>{{mentioned_by}}</strong> mentioned you in a comment:</p>

<blockquote style="border-left: 3px solid #d1d5db; padding-left: 15px; color: #6b7280;">
  {{comment_text}}
</blockquote>

<p><a href="{{action_url}}" class="button">View Comment</a></p>
```

### 5.2 Slack Integration

#### **Slack Webhook Setup**
```python
import requests

def send_slack_notification(webhook_url: str, notification: dict):
    """Send notification to Slack via webhook"""
    
    # Format Slack message
    slack_message = {
        "text": notification['title'],
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": notification['title']
                }
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": notification['message']
                }
            },
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "View Details"
                        },
                        "url": notification['action_url'],
                        "style": "primary"
                    }
                ]
            }
        ]
    }
    
    response = requests.post(webhook_url, json=slack_message)
    return response.ok
```

#### **Slack Message Examples**

**Assignment Notification**
```
🔔 New Review Assignment

Review Item: Cyclone Damage - Port Vila
Priority: 🔴 High
Due Date: Tomorrow at 5 PM
Assigned by: John Admin

[View Review]
```

**Mention Notification**
```
💬 You were mentioned

@john.admin mentioned you in Review #12345:
"Hey @jane, can you verify the coordinates? They look suspicious."

[View Comment]
```

### 5.3 In-App Notifications

#### **Real-time Updates**
```typescript
// WebSocket connection for real-time notifications
const ws = new WebSocket('wss://api.example.com/ws/notifications');

ws.onmessage = (event) => {
  const notification = JSON.parse(event.data);
  
  // Show toast notification
  toast.info(notification.title, {
    description: notification.message,
    action: {
      label: 'View',
      onClick: () => navigate(notification.action_url)
    }
  });
  
  // Update unread count
  dispatch(incrementUnreadCount());
};
```

---

## 6. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [ ] Database schema migration
- [ ] User authentication & RBAC system
- [ ] Permission checking middleware
- [ ] Basic audit logging

### Phase 2: Review Workflow (Weeks 3-4)
- [ ] Enhanced review items API
- [ ] Assignment system
- [ ] Comment system with threading
- [ ] Basic notifications (in-app)

### Phase 3: Notifications (Weeks 5-6)
- [ ] Email notification system
- [ ] Email templates
- [ ] Slack integration
- [ ] Notification preferences

### Phase 4: Background Jobs (Week 7)
- [ ] Celery setup
- [ ] Job queue implementation
- [ ] Auto-assignment logic
- [ ] Duplicate detection
- [ ] Due date monitoring

### Phase 5: Advanced Features (Week 8)
- [ ] Mention system
- [ ] Digest emails
- [ ] Audit trail export
- [ ] Analytics dashboard
- [ ] Performance optimization

### Phase 6: Testing & Polish (Week 9-10)
- [ ] Unit tests
- [ ] Integration tests
- [ ] Load testing
- [ ] Security audit
- [ ] Documentation

---

## 7. Security Considerations

### 7.1 Authentication
- JWT tokens with refresh mechanism
- Password hashing with bcrypt (cost factor 12)
- Rate limiting on auth endpoints
- Session management with Redis
- CSRF protection
- XSS prevention

### 7.2 Authorization
- Role-based access control (RBAC)
- Permission checking on every API call
- Row-level security for sensitive data
- API key rotation for integrations

### 7.3 Audit & Compliance
- All actions logged with user context
- IP address tracking
- Request ID for tracing
- GDPR-compliant data handling
- Data retention policies
- Export/delete user data on request

---

## 8. Performance Optimization

### 8.1 Caching Strategy
```python
# Redis caching for frequently accessed data
@cache.cached(timeout=300, key_prefix='user_permissions')
def get_user_permissions(user_id: str) -> List[str]:
    return db.query(Permission).filter_by(user_id=user_id).all()

@cache.cached(timeout=60, key_prefix='notification_count')
def get_unread_notification_count(user_id: str) -> int:
    return db.query(Notification).filter_by(
        recipient_id=user_id, 
        is_read=False
    ).count()
```

### 8.2 Database Optimization
- Proper indexing on foreign keys and query columns
- Pagination for large result sets
- Materialized views for analytics
- Connection pooling
- Query optimization (EXPLAIN ANALYZE)

### 8.3 Background Job Optimization
- Job priority queues
- Rate limiting on external API calls (Slack, email)
- Batch processing where possible
- Async I/O for network operations
- Retry with exponential backoff

---

## 9. Monitoring & Observability

### 9.1 Metrics to Track
- Review completion rate
- Average review time
- Assignment distribution
- Notification delivery success rate
- Job queue depth
- API response times
- Error rates

### 9.2 Alerts
- Failed notification deliveries
- High job queue depth (> 1000)
- Slow queries (> 1s)
- High error rate (> 5%)
- Overdue reviews not escalated
- Suspicious login attempts

---

## 10. Testing Strategy

### 10.1 Unit Tests
```python
def test_assign_review_item():
    """Test review item assignment"""
    review = create_test_review_item()
    user = create_test_user(role='reviewer')
    
    result = assign_review(review.id, user.id, reason='test')
    
    assert result.assigned_to == user.id
    assert result.status == 'under_review'
    assert notification_sent(user.id, 'assignment')

def test_permission_checking():
    """Test RBAC permission checking"""
    reviewer = create_user(role='reviewer')
    admin = create_user(role='admin')
    
    assert has_permission(reviewer, 'review:read')
    assert not has_permission(reviewer, 'user:manage')
    assert has_permission(admin, 'user:manage')
```

### 10.2 Integration Tests
```python
def test_complete_review_workflow():
    """Test complete review workflow with notifications"""
    # Create submission
    item = create_review_item(submitted_by=contributor_user)
    
    # Auto-assign
    run_job('auto_assign_reviews')
    assert item.assigned_to is not None
    assert notification_exists(item.assigned_to, 'assignment')
    
    # Add comment with mention
    add_comment(item.id, "Hey @senior, please review", author=reviewer)
    assert notification_exists(senior_user, 'mention')
    
    # Approve
    approve_review(item.id, reviewer=reviewer_user)
    assert item.status == 'approved'
    assert notification_exists(contributor_user, 'status_change')
    
    # Check audit trail
    audit = get_audit_trail(item.id)
    assert len(audit) >= 4  # Created, assigned, commented, approved
```

---

## 11. Documentation Requirements

### 11.1 API Documentation
- OpenAPI/Swagger spec
- Request/response examples
- Error codes and handling
- Authentication flow
- Rate limiting details

### 11.2 User Documentation
- Getting started guide
- Review workflow tutorial
- Permission matrix
- Notification settings guide
- FAQ

### 11.3 Admin Documentation
- Role management
- User administration
- Job monitoring
- Troubleshooting guide
- Backup and recovery

---

## Appendix A: Permission Matrix

| Permission | Admin | Senior Reviewer | Reviewer | Contributor | Viewer |
|-----------|-------|----------------|----------|-------------|--------|
| review:read | ✅ | ✅ | ✅ | ✅ (own) | ✅ |
| review:create | ✅ | ✅ | ✅ | ✅ | ❌ |
| review:update | ✅ | ✅ | ✅ (assigned) | ✅ (own, pending) | ❌ |
| review:approve | ✅ | ✅ | ❌ | ❌ | ❌ |
| review:reject | ✅ | ✅ | ❌ | ❌ | ❌ |
| review:assign | ✅ | ✅ | ❌ | ❌ | ❌ |
| review:flag | ✅ | ✅ | ✅ | ❌ | ❌ |
| metadata:update | ✅ | ✅ | ✅ (assigned) | ✅ (own) | ❌ |
| user:manage | ✅ | ❌ | ❌ | ❌ | ❌ |
| audit:view | ✅ | ✅ | ❌ | ❌ | ❌ |
| notification:send | ✅ | ✅ | ✅ (assigned) | ❌ | ❌ |

---

## Appendix B: Notification Event Types

| Event | Trigger | Recipients | Channels | Priority |
|-------|---------|-----------|----------|----------|
| assignment | Item assigned | Assignee | Email, Slack, In-app | High |
| mention | User mentioned in comment | Mentioned user | Email, In-app | High |
| comment | New comment added | Item participants | In-app | Normal |
| status_change | Status updated | Submitter, Assignee | Email, In-app | Normal |
| flag | Item flagged | Flagged by, Assigned to | Email, Slack | High |
| due_soon | Due in 24h | Assignee | Email, In-app | Normal |
| overdue | Past due date | Assignee, Manager | Email, Slack | High |
| escalation | 3 days overdue | Senior reviewers | Email, Slack | Urgent |
| approval | Item approved | Submitter | Email, In-app | Normal |
| rejection | Item rejected | Submitter | Email, In-app | Normal |
| duplicate | Potential duplicate found | Submitter | In-app | Low |

---

**Document Version**: 1.0  
**Last Updated**: November 10, 2025  
**Status**: Proposal - Ready for Review

# ReviewWorkflow Enhancement - Implementation Strategy & Integration Plan
**Addressing Scope, Migration, and Existing System Integration**

## Executive Summary

This document addresses critical integration concerns raised during review of the ReviewWorkflow Enhancement Proposal. It provides:
1. **Integration with existing authentication** (Microsoft Graph/SSO)
2. **Phased migration strategy** to avoid "big bang" rewrites
3. **API versioning and backward compatibility** plan
4. **Risk mitigation** for scope creep
5. **Concrete deliverable increments** with clear success criteria

---

## 1. Current System Assessment

### 1.1 Existing Authentication & Identity

**Current State Analysis:**
```bash
# Check existing user management
grep -r "microsoft|azure|sso|oauth" app/
grep -r "class.*User" app/models/
```

**Assumptions to Validate:**
- ✅ Current authentication mechanism (JWT? Session? OAuth?)
- ✅ Existing user model structure
- ✅ SSO/IdP integration (Microsoft Graph, Azure AD, etc.)
- ✅ Password storage (if local auth exists)
- ✅ Session management approach

### 1.2 Integration Requirements

#### **Option A: Federated Identity (Recommended)**
```python
# Extend existing User model instead of replacing
class User(Base):
    __tablename__ = 'users'
    
    # EXISTING FIELDS (don't modify)
    id = Column(UUID, primary_key=True)
    email = Column(String)
    # ... existing SSO fields ...
    
    # NEW FIELDS (add via migration)
    role_id = Column(Integer, ForeignKey('roles.id'))
    notification_preferences = Column(JSONB, default={})
    review_preferences = Column(JSONB, default={})
    
    # RELATIONSHIPS
    role = relationship('Role', back_populates='users')
```

#### **Option B: Hybrid Approach**
```
┌─────────────────────────────────────────┐
│  External IdP (Azure AD / Microsoft)    │
│  - Authentication                       │
│  - Basic profile (email, name)          │
└────────────────┬────────────────────────┘
                 │
                 │ JWT with claims
                 ▼
┌─────────────────────────────────────────┐
│  Impact Database                        │
│  - User shadows/profiles                │
│  - RBAC (roles/permissions)             │
│  - Review workflow state                │
│  - Notification preferences             │
└─────────────────────────────────────────┘
```

**JWT Token Structure:**
```json
{
  "sub": "user@example.com",
  "oid": "azure-object-id",
  "name": "Jane Reviewer",
  "email": "jane@example.com",
  "roles": ["reviewer"],
  "permissions": ["review:read", "review:update"],
  "exp": 1699632000
}
```

---

## 2. Phased Rollout Strategy

### Phase 0: Foundation & Integration (Week 1-2)
**Goal:** Minimal changes to validate existing system integration

**Deliverables:**
- [ ] Document current auth flow (SSO, local, hybrid)
- [ ] Create `roles` and `permissions` tables
- [ ] Add `role_id` column to existing `users` table
- [ ] Implement permission checker middleware (read-only mode)
- [ ] Create role seeding script with default roles
- [ ] NO UI changes, NO breaking API changes

**Migration Script:**
```sql
-- Migration 001: Add RBAC foundation
BEGIN;

-- Create roles table
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    level INTEGER NOT NULL,
    is_system_role BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create permissions table
CREATE TABLE permissions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    resource VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT
);

-- Create role_permissions junction
CREATE TABLE role_permissions (
    role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Add role_id to existing users (nullable initially)
ALTER TABLE users ADD COLUMN role_id INTEGER REFERENCES roles(id);
ALTER TABLE users ADD COLUMN notification_preferences JSONB DEFAULT '{"email": true, "in_app": true}';

-- Seed default roles
INSERT INTO roles (name, display_name, level, is_system_role) VALUES
('admin', 'Administrator', 1, true),
('reviewer', 'Reviewer', 3, true),
('contributor', 'Contributor', 4, true);

-- Seed basic permissions
INSERT INTO permissions (name, resource, action) VALUES
('review:read', 'review_item', 'read'),
('review:update', 'review_item', 'update'),
('review:approve', 'review_item', 'approve');

-- Assign admin role to existing admins (adjust WHERE clause to match your data)
UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'admin') 
WHERE is_admin = true;

-- Assign contributor role to remaining users
UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'contributor') 
WHERE role_id IS NULL;

COMMIT;
```

**Success Criteria:**
- ✅ Migration runs without errors
- ✅ All existing users have a role assigned
- ✅ Permission checking works in read-only mode
- ✅ No production downtime
- ✅ Existing auth flow unchanged

---

### Phase 1: Assignment & Audit Trail (Week 3-4)
**Goal:** Enable core workflow features using existing user model

**Deliverables:**
- [ ] Create `review_items` table (maps to existing `image_metadata`)
- [ ] Create `review_assignments` table (history tracking)
- [ ] Create `review_audit_trail` table (enhanced audit logs)
- [ ] API endpoints: `/api/v1/review-items/{id}/assign`
- [ ] API endpoints: `/api/v1/review-items/{id}/audit-trail`
- [ ] UI: Assignment modal in `ReviewWorkflow.tsx`
- [ ] UI: Audit trail tab

**Migration Script:**
```sql
-- Migration 002: Review assignments & audit trail
BEGIN;

-- Create review_items (virtual view or actual table)
CREATE TABLE review_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id UUID REFERENCES image_metadata(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending',
    priority VARCHAR(20) DEFAULT 'medium',
    assigned_to UUID REFERENCES users(id),
    assigned_at TIMESTAMP WITH TIME ZONE,
    assigned_by UUID REFERENCES users(id),
    submitted_by UUID REFERENCES users(id) NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewer_notes TEXT,
    due_date TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'
);

-- Create assignment history
CREATE TABLE review_assignments (
    id SERIAL PRIMARY KEY,
    review_item_id UUID REFERENCES review_items(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES users(id),
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    unassigned_at TIMESTAMP WITH TIME ZONE,
    reason VARCHAR(50),
    notes TEXT
);

-- Create audit trail (extends existing audit_log)
CREATE TABLE review_audit_trail (
    id SERIAL PRIMARY KEY,
    review_item_id UUID REFERENCES review_items(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    actor_id UUID REFERENCES users(id),
    field_changed VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    notes TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    source VARCHAR(50) DEFAULT 'web'
);

-- Indexes
CREATE INDEX idx_review_items_assigned_to ON review_items(assigned_to);
CREATE INDEX idx_review_items_status ON review_items(status);
CREATE INDEX idx_audit_review_item ON review_audit_trail(review_item_id);
CREATE INDEX idx_audit_timestamp ON review_audit_trail(timestamp);

COMMIT;
```

**API Implementation (Backward Compatible):**
```python
# New endpoints (v1)
@router.post("/api/v1/review-items/{id}/assign")
@require_permission("review:assign")
async def assign_review_item(id: str, assignment: AssignmentRequest):
    """Assign review item to user"""
    pass

# Existing endpoints (v0) - maintain compatibility
@router.patch("/api/admin/curation/{id}")
@require_admin  # Keep existing decorator
async def update_curation_status(id: str, update: StatusUpdate):
    """Existing endpoint - unchanged"""
    pass
```

**UI Changes (Non-Breaking):**
```tsx
// Add new assignment modal without changing existing functionality
<ReviewWorkflow imageId={id}>
  {/* Existing tabs */}
  <Tab name="review">{/* unchanged */}</Tab>
  <Tab name="metadata">{/* unchanged */}</Tab>
  
  {/* New tabs - feature flagged */}
  {hasPermission('review:assign') && (
    <Tab name="assignments">
      <AssignmentHistory itemId={id} />
    </Tab>
  )}
  
  {hasPermission('audit:view') && (
    <Tab name="audit">
      <AuditTrail itemId={id} />
    </Tab>
  )}
</ReviewWorkflow>
```

**Success Criteria:**
- ✅ Can assign reviews to users
- ✅ Assignment history is tracked
- ✅ Audit trail captures all changes
- ✅ Existing review workflow still works
- ✅ No breaking changes to current UI/API

---

### Phase 2: Comments & Mentions (Week 5-6)
**Goal:** Enable collaboration without notification infrastructure

**Deliverables:**
- [ ] Create `comments` table
- [ ] Create `mentions` table (in-app only, no email yet)
- [ ] API: `/api/v1/review-items/{id}/comments`
- [ ] UI: `MentionInput` component with `@` autocomplete
- [ ] UI: In-app notification badge (counter only)
- [ ] Background job: Extract mentions from comments

**Migration Script:**
```sql
-- Migration 003: Comments & mentions
BEGIN;

CREATE TABLE comments (
    id SERIAL PRIMARY KEY,
    review_item_id UUID REFERENCES review_items(id) ON DELETE CASCADE,
    parent_comment_id INTEGER REFERENCES comments(id),
    author_id UUID REFERENCES users(id),
    content TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT false,
    attachments JSONB DEFAULT '[]',
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE mentions (
    id SERIAL PRIMARY KEY,
    review_item_id UUID REFERENCES review_items(id) ON DELETE CASCADE,
    comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    mentioned_user_id UUID REFERENCES users(id),
    mentioned_by UUID REFERENCES users(id),
    mentioned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_comments_review_item ON comments(review_item_id);
CREATE INDEX idx_mentions_user ON mentions(mentioned_user_id, is_read);

COMMIT;
```

**Implementation Notes:**
- Comments work immediately (CRUD operations)
- Mentions create in-app notifications only (no email yet)
- UI shows unread count but no push/email/Slack
- Reduces complexity while validating user behavior

**Success Criteria:**
- ✅ Users can comment on reviews
- ✅ `@mention` syntax works with autocomplete
- ✅ Mentioned users see unread count
- ✅ Comments are threaded (replies)

---

### Phase 3: In-App Notifications (Week 7-8)
**Goal:** Complete notification center without external channels

**Deliverables:**
- [ ] Create `notifications` table
- [ ] API: `/api/v1/notifications` (CRUD)
- [ ] UI: `NotificationBell` component with dropdown
- [ ] UI: Notification preferences page (in-app only)
- [ ] Background job: Generate notifications from events
- [ ] WebSocket: Real-time notification delivery

**Migration Script:**
```sql
-- Migration 004: In-app notifications
BEGIN;

CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    recipient_id UUID REFERENCES users(id),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    action_url VARCHAR(500),
    review_item_id UUID REFERENCES review_items(id),
    comment_id INTEGER REFERENCES comments(id),
    triggered_by UUID REFERENCES users(id),
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE notification_preferences (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) UNIQUE,
    in_app_enabled BOOLEAN DEFAULT true,
    notify_on_assignment BOOLEAN DEFAULT true,
    notify_on_mention BOOLEAN DEFAULT true,
    notify_on_comment BOOLEAN DEFAULT true,
    notify_on_status_change BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient ON notifications(recipient_id, is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at);

COMMIT;
```

**Event Triggers:**
```python
# Automatic notification generation
@event_handler('review.assigned')
def on_review_assigned(review_item, assignee, assigner):
    create_notification(
        recipient=assignee,
        type='assignment',
        title=f'New review assigned by {assigner.name}',
        message=f'Review: {review_item.title}',
        action_url=f'/review/{review_item.id}',
        review_item_id=review_item.id,
        triggered_by=assigner.id
    )

@event_handler('comment.mentioned')
def on_user_mentioned(comment, mentioned_user):
    create_notification(
        recipient=mentioned_user,
        type='mention',
        title=f'{comment.author.name} mentioned you',
        message=comment.content[:200],
        action_url=f'/review/{comment.review_item_id}#comment-{comment.id}',
        comment_id=comment.id,
        triggered_by=comment.author.id
    )
```

**Success Criteria:**
- ✅ Notification bell shows unread count
- ✅ Dropdown lists recent notifications
- ✅ Clicking notification navigates to relevant page
- ✅ Users can mark notifications as read
- ✅ Users can adjust notification preferences
- ✅ Real-time updates via WebSocket

---

### Phase 4: Email Notifications (Week 9)
**Goal:** Add email channel without disrupting existing system

**Deliverables:**
- [ ] Email template system
- [ ] SMTP configuration (use existing if available)
- [ ] Background job: Send email notifications
- [ ] User preference: Email on/off per event type
- [ ] Email digest option (daily summary)
- [ ] Unsubscribe mechanism

**Configuration:**
```python
# Use existing email infrastructure or add new
EMAIL_BACKEND = os.getenv('EMAIL_BACKEND', 'django.core.mail.backends.smtp.EmailBackend')
SMTP_HOST = os.getenv('SMTP_HOST')  # Reuse existing settings
SMTP_PORT = int(os.getenv('SMTP_PORT', 587))

# New settings for notifications
NOTIFICATION_EMAIL_FROM = os.getenv('NOTIFICATION_EMAIL_FROM', 'notifications@impactdb.org')
NOTIFICATION_EMAIL_REPLY_TO = os.getenv('NOTIFICATION_EMAIL_REPLY_TO', 'noreply@impactdb.org')
```

**Migration Script:**
```sql
-- Migration 005: Email notifications
BEGIN;

-- Add email columns to notifications table
ALTER TABLE notifications ADD COLUMN email_sent BOOLEAN DEFAULT false;
ALTER TABLE notifications ADD COLUMN email_sent_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE notifications ADD COLUMN email_error TEXT;

-- Add email preferences
ALTER TABLE notification_preferences ADD COLUMN email_enabled BOOLEAN DEFAULT true;
ALTER TABLE notification_preferences ADD COLUMN digest_mode VARCHAR(20) DEFAULT 'instant';
ALTER TABLE notification_preferences ADD COLUMN last_digest_sent_at TIMESTAMP WITH TIME ZONE;

-- Email templates
CREATE TABLE email_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT NOT NULL,
    variables JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMIT;
```

**Success Criteria:**
- ✅ Users receive email for assignments/mentions
- ✅ Email templates are professional and branded
- ✅ Users can disable email notifications
- ✅ Digest mode consolidates multiple notifications
- ✅ Unsubscribe link works
- ✅ Email delivery is tracked

---

### Phase 5: Slack Integration (Week 10)
**Goal:** Optional Slack notifications for teams

**Deliverables:**
- [ ] Slack webhook configuration
- [ ] Slack-specific message formatting
- [ ] User preference: Slack webhook URL
- [ ] Background job: Send Slack notifications
- [ ] Error handling & retry logic

**Migration Script:**
```sql
-- Migration 006: Slack notifications
BEGIN;

-- Add Slack columns to notifications table
ALTER TABLE notifications ADD COLUMN slack_sent BOOLEAN DEFAULT false;
ALTER TABLE notifications ADD COLUMN slack_sent_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE notifications ADD COLUMN slack_error TEXT;

-- Add Slack preferences
ALTER TABLE notification_preferences ADD COLUMN slack_enabled BOOLEAN DEFAULT false;
ALTER TABLE notification_preferences ADD COLUMN slack_webhook_url VARCHAR(500);
ALTER TABLE notification_preferences ADD COLUMN slack_channel VARCHAR(100);

COMMIT;
```

**Implementation Note:**
- Slack is entirely opt-in per user
- No system-wide Slack dependency
- Graceful degradation if webhook fails

**Success Criteria:**
- ✅ Users can configure Slack webhook
- ✅ Notifications appear in Slack channel
- ✅ Slack failures don't affect other channels
- ✅ Rich formatting (buttons, links) works

---

### Phase 6: Background Jobs & Automation (Week 11-12)
**Goal:** Automated workflows and cleanup

**Deliverables:**
- [ ] Auto-assignment based on workload
- [ ] Due date monitoring & escalation
- [ ] Duplicate detection
- [ ] Daily digest generation
- [ ] Notification cleanup (delete old read notifications)
- [ ] Audit log archival

**Migration Script:**
```sql
-- Migration 007: Background jobs
BEGIN;

CREATE TABLE background_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    payload JSONB NOT NULL,
    result JSONB,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    scheduled_for TIMESTAMP WITH TIME ZONE,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3
);

CREATE INDEX idx_jobs_status ON background_jobs(status, scheduled_for);

COMMIT;
```

**Celery Tasks:**
```python
# Celery beat schedule
CELERY_BEAT_SCHEDULE = {
    'auto-assign-reviews': {
        'task': 'tasks.auto_assign_reviews',
        'schedule': crontab(minute='*/30'),  # Every 30 min
    },
    'check-due-dates': {
        'task': 'tasks.check_due_dates',
        'schedule': crontab(minute='*/60'),  # Every hour
    },
    'send-daily-digests': {
        'task': 'tasks.send_daily_digests',
        'schedule': crontab(hour=8, minute=0),  # 8 AM daily
    },
    'cleanup-notifications': {
        'task': 'tasks.cleanup_old_notifications',
        'schedule': crontab(hour=2, minute=0),  # 2 AM daily
    },
}
```

**Success Criteria:**
- ✅ Unassigned reviews are auto-assigned
- ✅ Overdue reviews trigger escalation
- ✅ Daily digests arrive on time
- ✅ Old notifications are cleaned up
- ✅ Jobs can be monitored/retried

---

## 3. API Versioning Strategy

### 3.1 Version Coexistence

**Approach:** Run v0 (existing) and v1 (new) APIs side-by-side

```python
# Existing API (v0) - no changes
@router.get("/api/admin/curation")
async def list_curation_items():
    """Existing endpoint - unchanged"""
    pass

# New API (v1) - additive only
@router.get("/api/v1/review-items")
async def list_review_items():
    """New endpoint - uses same data, different format"""
    pass
```

### 3.2 Client Migration Path

```typescript
// Frontend: Feature flag for v1 adoption
const USE_V1_API = process.env.NEXT_PUBLIC_USE_V1_API === 'true';

async function getReviewItems() {
  if (USE_V1_API) {
    return fetch('/api/v1/review-items');
  } else {
    return fetch('/api/admin/curation');
  }
}
```

### 3.3 Deprecation Timeline

| Phase | v0 API | v1 API | Status |
|-------|--------|--------|--------|
| Phase 0-2 | Active | Not available | Current |
| Phase 3-4 | Active | Beta (opt-in) | Parallel |
| Phase 5-6 | Active | Stable | Parallel |
| Phase 7+ | Deprecated | Stable | v1 only |

**Deprecation Headers:**
```http
GET /api/admin/curation
Response:
  Deprecation: true
  Sunset: Sun, 01 Jun 2026 00:00:00 GMT
  Link: </api/v1/review-items>; rel="alternate"
```

---

## 4. Permission Loading & Caching

### 4.1 Token-Based Permissions (Recommended)

**JWT Token Structure:**
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "role": "reviewer",
  "permissions": [
    "review:read",
    "review:update",
    "metadata:update"
  ],
  "exp": 1699632000
}
```

**Frontend Implementation:**
```typescript
// Load permissions from token (client-side)
import { jwtDecode } from 'jwt-decode';

interface AuthToken {
  sub: string;
  email: string;
  role: string;
  permissions: string[];
  exp: number;
}

export function useAuth() {
  const [auth, setAuth] = useState<AuthToken | null>(null);
  
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      try {
        const decoded = jwtDecode<AuthToken>(token);
        setAuth(decoded);
      } catch (err) {
        // Invalid token
        localStorage.removeItem('auth_token');
      }
    }
  }, []);
  
  return auth;
}

export function usePermission(permission: string) {
  const auth = useAuth();
  return auth?.permissions.includes(permission) ?? false;
}
```

**PermissionGate Component:**
```tsx
interface PermissionGateProps {
  permission: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function PermissionGate({ 
  permission, 
  fallback = null, 
  children 
}: PermissionGateProps) {
  const hasPermission = usePermission(permission);
  const auth = useAuth();
  
  // Loading state: don't flash UI
  if (auth === null) {
    return <Skeleton />;
  }
  
  // Permission check
  if (!hasPermission) {
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
}
```

### 4.2 Caching Strategy

**Server-Side (Redis):**
```python
@cache.cached(timeout=300, key_prefix='user_permissions')
def get_user_permissions(user_id: str) -> List[str]:
    """Cache permissions for 5 minutes"""
    user = db.query(User).filter_by(id=user_id).first()
    if not user or not user.role:
        return []
    return [p.name for p in user.role.permissions]
```

**Client-Side (React Query):**
```typescript
export function useUserPermissions() {
  return useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      const res = await fetch('/api/v1/auth/me');
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
  });
}
```

---

## 5. Risk Mitigation

### 5.1 Scope Creep Prevention

**Hard Constraints:**
- ✅ **No custom OAuth implementation** - Use existing IdP
- ✅ **No password storage** - Delegate to SSO/IdP
- ✅ **No custom email server** - Use existing SMTP
- ✅ **No mobile app changes** - Web-first approach

**Deferred Features (Post-MVP):**
- ❌ Advanced role hierarchies (inheritance, delegation)
- ❌ Time-based permissions (temporary access)
- ❌ Custom email template editor UI
- ❌ Push notifications (browser/mobile)
- ❌ Slack bot commands (interactive workflow)
- ❌ Real-time collaborative editing
- ❌ Advanced analytics dashboard

### 5.2 Rollback Strategy

Each phase has a rollback plan:

**Phase 1-2 Rollback:**
```sql
-- Remove new tables without affecting existing data
BEGIN;
DROP TABLE review_audit_trail CASCADE;
DROP TABLE review_assignments CASCADE;
DROP TABLE review_items CASCADE;
COMMIT;
```

**Phase 3+ Rollback:**
```sql
-- Disable notifications without data loss
BEGIN;
ALTER TABLE notification_preferences 
  ALTER COLUMN in_app_enabled SET DEFAULT false;
UPDATE notification_preferences SET in_app_enabled = false;
COMMIT;
```

### 5.3 Performance Monitoring

**Key Metrics:**
- Notification delivery latency (< 5s)
- Job queue depth (< 100 pending)
- API response time (p95 < 500ms)
- Database query time (< 100ms)
- Cache hit rate (> 80%)

**Alerts:**
```yaml
alerts:
  - name: NotificationBacklog
    condition: background_jobs.count{status=pending} > 500
    severity: warning
    
  - name: HighJobFailureRate
    condition: rate(background_jobs.count{status=failed}[5m]) > 0.1
    severity: critical
    
  - name: SlowAPIResponses
    condition: http_request_duration_seconds{quantile=0.95} > 1
    severity: warning
```

---

## 6. Integration Checklist

### 6.1 Pre-Phase 0 (Discovery)

- [ ] **Document current auth flow**
  - [ ] SSO provider (Azure AD, Okta, etc.)
  - [ ] Token format (JWT, opaque)
  - [ ] Session management
  - [ ] Existing user model structure
  
- [ ] **Identify API clients**
  - [ ] Web UI (Next.js frontend)
  - [ ] Mobile app (if exists)
  - [ ] External integrations
  - [ ] Admin tools
  
- [ ] **Assess existing infrastructure**
  - [ ] Email service (SMTP, SendGrid, etc.)
  - [ ] Job queue (Celery? Redis? None?)
  - [ ] WebSocket support (Socket.io? WS?)
  - [ ] Monitoring (Sentry, Datadog, etc.)

### 6.2 Phase Readiness Checklist

**Before Phase 1:**
- [ ] Alembic migration scripts tested
- [ ] Rollback scripts tested
- [ ] Database backups automated
- [ ] Staging environment validated
- [ ] API documentation updated

**Before Phase 3 (Notifications):**
- [ ] WebSocket server tested under load
- [ ] Redis capacity assessed
- [ ] Email sending limits confirmed
- [ ] Notification preferences UI reviewed

**Before Phase 6 (Background Jobs):**
- [ ] Celery workers provisioned
- [ ] Job monitoring dashboard ready
- [ ] Error alerting configured
- [ ] Job retry policies defined

---

## 7. Success Metrics

### 7.1 Phase 1-2 (Assignment & Audit)

**Quantitative:**
- ✅ 100% of reviews have assignment history
- ✅ Audit trail captures all status changes
- ✅ <10ms overhead per API request
- ✅ Zero data loss during migration

**Qualitative:**
- ✅ Reviewers can find assigned items easily
- ✅ Admins can trace all review decisions
- ✅ No user complaints about missing data

### 7.2 Phase 3-4 (Notifications)

**Quantitative:**
- ✅ <5s notification delivery time (p95)
- ✅ >95% notification delivery success rate
- ✅ <2% user opt-out rate
- ✅ >50% of mentions result in comment replies

**Qualitative:**
- ✅ Users discover mentions without manual checking
- ✅ Email notifications are actionable
- ✅ Notification preferences are intuitive

### 7.3 Phase 5-6 (Automation)

**Quantitative:**
- ✅ >80% of reviews auto-assigned
- ✅ <24h median time-to-assignment
- ✅ >90% duplicate detection accuracy
- ✅ Zero job queue failures

**Qualitative:**
- ✅ Workload is balanced across reviewers
- ✅ Overdue reviews are escalated promptly
- ✅ Duplicates are caught before review

---

## 8. Recommendations Summary

### 8.1 Critical Path

**Must Do First:**
1. ✅ Validate existing auth integration (SSO, user model)
2. ✅ Add RBAC tables with backward-compatible migration
3. ✅ Implement assignment & audit trail (no notifications)
4. ✅ Test phase 1-2 in production for 2 weeks
5. ✅ Proceed with notifications only after validation

**Can Defer:**
- ❌ Email/Slack notifications (use in-app first)
- ❌ Background job automation (manual assignment initially)
- ❌ Advanced permission hierarchies

### 8.2 Decision Points

**Decision 1: Authentication Strategy**
- **Option A (Recommended):** Extend existing SSO with RBAC layer
- **Option B:** Build custom auth (NOT RECOMMENDED - high risk)

**Decision 2: User Model**
- **Option A (Recommended):** Extend existing `users` table with `role_id`
- **Option B:** Create separate `app_users` table (introduces complexity)

**Decision 3: API Versioning**
- **Option A (Recommended):** /api/v1 with parallel v0 support
- **Option B:** Break existing API (NOT RECOMMENDED)

### 8.3 Go/No-Go Criteria

**Phase 1 Go Criteria:**
- ✅ Migration runs successfully on staging
- ✅ All existing tests pass
- ✅ Performance regression < 10%
- ✅ Rollback tested and documented

**Phase 3 Go Criteria:**
- ✅ Phase 1-2 stable for 2+ weeks
- ✅ WebSocket infrastructure tested
- ✅ Redis capacity sufficient
- ✅ User feedback on assignments is positive

**Phase 6 Go Criteria:**
- ✅ Phase 3-5 stable for 4+ weeks
- ✅ Celery workers provisioned
- ✅ Job monitoring operational
- ✅ Manual workflows validated

---

## 9. Open Questions & Decisions Needed

### 9.1 Technical Decisions

1. **SSO Integration:** What is the current IdP? (Azure AD, Okta, Auth0, custom?)
2. **Email Service:** Existing SMTP? SendGrid? AWS SES?
3. **Job Queue:** Celery already deployed? Redis available?
4. **WebSocket:** Socket.io, native WS, or polling?

### 9.2 Product Decisions

1. **Default Role:** What role for new users? (contributor? viewer?)
2. **Notification Opt-in:** Opt-in or opt-out by default?
3. **Email Frequency:** Instant, digest, or user choice?
4. **Assignment Algorithm:** Round-robin, workload-based, or manual only?

### 9.3 Business Decisions

1. **Timeline:** 12-week rollout acceptable? Need faster?
2. **Resources:** Dedicated dev team? Part-time?
3. **Beta Testing:** Internal users first? Soft launch?
4. **Slack Integration:** Organization-wide or user-specific webhooks?

---

## 10. Appendix: Migration Validation Scripts

### 10.1 Pre-Migration Validation

```python
#!/usr/bin/env python3
"""Validate database state before migration"""

def validate_pre_migration():
    # Check for conflicting data
    users_without_email = db.query(User).filter(User.email == None).count()
    assert users_without_email == 0, "All users must have emails"
    
    # Check for orphaned records
    orphaned_images = db.query(ImageMetadata).filter(
        ~ImageMetadata.uploader_id.in_(db.query(User.id))
    ).count()
    assert orphaned_images == 0, "No orphaned images allowed"
    
    print("✅ Pre-migration validation passed")
```

### 10.2 Post-Migration Validation

```python
#!/usr/bin/env python3
"""Validate database state after migration"""

def validate_post_migration():
    # Verify all users have roles
    users_without_roles = db.query(User).filter(User.role_id == None).count()
    assert users_without_roles == 0, "All users must have roles"
    
    # Verify role-permission mappings
    admin_role = db.query(Role).filter_by(name='admin').first()
    assert len(admin_role.permissions) > 0, "Admin must have permissions"
    
    # Verify indexes exist
    indexes = db.execute("SELECT indexname FROM pg_indexes WHERE tablename = 'review_items'")
    assert 'idx_review_items_status' in [r[0] for r in indexes], "Missing index"
    
    print("✅ Post-migration validation passed")
```

### 10.3 Data Integrity Check

```python
#!/usr/bin/env python3
"""Verify data integrity after migration"""

def check_data_integrity():
    # Count records before and after
    pre_count = get_pre_migration_counts()
    post_count = get_post_migration_counts()
    
    assert pre_count['users'] == post_count['users'], "User count mismatch"
    assert pre_count['images'] == post_count['images'], "Image count mismatch"
    
    # Verify referential integrity
    review_items = db.query(ReviewItem).count()
    valid_image_refs = db.query(ReviewItem).join(ImageMetadata).count()
    assert review_items == valid_image_refs, "Invalid image references"
    
    print("✅ Data integrity check passed")
```

---

**Document Version**: 1.0  
**Last Updated**: November 10, 2025  
**Status**: Implementation Strategy - Ready for Technical Review  
**Related**: REVIEW_WORKFLOW_ENHANCEMENT_PROPOSAL.md

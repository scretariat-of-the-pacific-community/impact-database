# Delete Data Flow Diagram

## User Delete Image Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER DELETES IMAGE                          │
└─────────────────────────────────────────────────────────────────┘

                    ┌──────────────────────┐
                    │   User Authenticated?│
                    └──────────┬───────────┘
                             YES
                              │
                    ┌─────────▼──────────┐
                    │ Check Permissions  │
                    └─────────┬──────────┘
                              │
                              │
        ┌─────────────────────┴──────────────────────┐
        │                                             │
   IS OWNER?                                      IS ADMIN?
     YES│                                             │YES
       │                                             │
       │              ┌────────────────────────────────
       │              │
  ┌────▼──────┐  ┌────▼───────────────────┐
  │Image      │  │Can delete any status:  │
  │Status ==? │  │ ✓ pending_review       │
  └────┬──────┘  │ ✓ approved             │
       │         │ ✓ rejected             │
    ┌──┴──┐      │ ✓ archived             │
    │     │      └────┬───────────────────┘
PENDING   OTHER       │
REVIEW  STATUS        │
    │     │          │
    ✓     ✗         ✓
    │     │         │
    │  ┌──▼───┐    │
    │  │ERROR │    │
    │  │ 403  │    │
    │  └──────┘    │
    │              │
    └──────┬───────┘
           │
    ┌──────▼──────────────────┐
    │ DELETE FROM STORAGE:    │
    │ 1. MinIO object         │
    │ 2. Thumbnail           │
    └──────┬──────────────────┘
           │
    ┌──────▼──────────────────┐
    │ DELETE FROM DATABASE:   │
    │ 1. image_metadata       │
    │ 2. related records      │
    └──────┬──────────────────┘
           │
    ┌──────▼──────────────────┐
    │ CREATE AUDIT LOG:       │
    │ - action: DELETE        │
    │ - user_id: current user │
    │ - timestamp             │
    │ - metadata snapshot     │
    └──────┬──────────────────┘
           │
    ┌──────▼──────────────────┐
    │    RETURN SUCCESS       │
    │ {                       │
    │   "success": true,      │
    │   "message": "Deleted"  │
    │ }                       │
    └────────────────────────┘
```

---

## Delete Account & All Data Flow

```
┌────────────────────────────────────────────────────────────────┐
│              USER DELETES ACCOUNT                              │
└────────────────────────────────────────────────────────────────┘

         ┌──────────────────────────────┐
         │  Initiate Delete Account     │
         │  POST /api/user/account      │
         └──────────┬───────────────────┘
                    │
         ┌──────────▼───────────────────┐
         │ Authenticate User            │
         │ Verify JWT Token Valid       │
         └──────────┬───────────────────┘
                    │
         ┌──────────▼───────────────────┐
         │ OPTIONAL: Export Data First  │
         │ GET /api/user/export         │
         │ (Download as ZIP)            │
         └──────────┬───────────────────┘
                    │
    ┌───────────────┴──────────────────┐
    │ DELETE IN SEQUENCE:              │
    │                                  │
    │ 1. All Image Files               │
    │    └─ images/{filename}          │
    │    └─ thumbnails                 │
    │                                  │
    │ 2. All Video Files               │
    │    └─ videos/{video_id}          │
    │                                  │
    │ 3. Database Records              │
    │    └─ users                      │
    │    └─ image_metadata             │
    │    └─ video_metadata             │
    │    └─ user_settings              │
    │    └─ api_tokens                 │
    │    └─ audit_logs                 │
    │                                  │
    │ 4. Cache & Sessions              │
    │    └─ Clear JWT tokens           │
    │    └─ Clear Redis cache          │
    │                                  │
    └───────────┬──────────────────────┘
                │
    ┌───────────▼──────────────────────┐
    │ CREATE FINAL AUDIT LOG:          │
    │ - action: ACCOUNT_DELETED        │
    │ - user_id: deleted_user_id       │
    │ - timestamp                      │
    │ - reason: user_requested         │
    └───────────┬──────────────────────┘
                │
    ┌───────────▼──────────────────────┐
    │ SEND CONFIRMATION EMAIL          │
    └───────────┬──────────────────────┘
                │
    ┌───────────▼──────────────────────┐
    │ RETURN SUCCESS & LOGOUT          │
    │ {                                │
    │   "success": true,               │
    │   "message": "Account deleted"   │
    │   "redirect": "/goodbye"         │
    │ }                                │
    └────────────────────────────────────┘
```

---

## Delete Permission Decision Tree

```
                    ┌─ DELETE IMAGE ─┐
                    │ API REQUEST    │
                    └────────┬────────┘
                             │
                    ┌────────▼─────────┐
                    │ User Logged In? │
                    └────────┬─────────┘
                           NO│YES
                             │ │
                      ┌──────┘ │
                      │        │
                    ❌  ┌────────▼──────────┐
                401   │ User = Image      │
                      │ Owner or Admin?  │
                      └────────┬──────────┘
                             NO│YES
                              │ │
                        ❌ ┌───┴──────────────┐
                       403│ Image Status?    │
                          │                  │
                          │ pending_review   │ other
                          │ or NULL          │ statuses
                          │                  │
                          │ ✓                │ ❌
                          │                  │ (unless admin)
                    ┌─────▼──────────────┐  │
                    │ CONFIRM DELETE? ⚠️  │  │
                    │ Show dialog         │  │
                    └─────┬──────────────┘  │
                         YES                │
                          │                 │
                    ┌─────▼──────────────┐  │
                    │ DELETE IMAGE       │  │
                    │ - Storage          │  │
                    │ - Database         │  │
                    │ - Audit Log        │  │
                    └─────┬──────────────┘  │
                          │                 │
                    ┌─────▼──────────────┐  │
                    │ SUCCESS ✅         │  │
                    │ Return 200 OK      │  │
                    └────────────────────┘  │
                                           │
                                    ┌──────▼────┐
                                    │ ERROR ❌   │
                                    │ Return 403│
                                    └───────────┘
```

---

## API Endpoints Summary

```
┌────────────────────────────────────────────────────────────────┐
│                    DELETE ENDPOINTS                            │
└────────────────────────────────────────────────────────────────┘

IMAGE DELETION
├─ DELETE /api/images/{filename}
│  └─ Auth: ✓ Required
│  └─ Owner-only or Admin
│  └─ Status: pending_review (or admin)
│
ACCOUNT DELETION
├─ DELETE /api/user/account
│  └─ Auth: ✓ Required
│  └─ Deletes: User + All Data
│  └─ Irreversible: ⚠️ YES
│
TOKEN DELETION
├─ DELETE /api/user/tokens/{token_id}
│  └─ Auth: ✓ Required
│  └─ Revokes: API token
│
AVATAR DELETION
├─ DELETE /api/user/avatar
│  └─ Auth: ✓ Required
│  └─ Removes: Profile picture
│
ADMIN: USER DELETION
├─ DELETE /api/admin/users/{user_id}
│  └─ Auth: ✓ Required (Admin)
│  └─ Permission: MANAGE_USERS
│  └─ Deletes: User account
│
ADMIN: BULK USER DELETION
├─ POST /api/admin/users/bulk-action
│  └─ Auth: ✓ Required (Admin)
│  └─ Action: "delete"
│  └─ Bulk: Multiple users
│
CURATION: COMMENT DELETION
├─ DELETE /api/curation/{queue_item_id}/comments/{comment_id}
│  └─ Auth: ✓ Required
│  └─ Owner-only or Admin
```

---

## Data Deletion Cascade

```
                    ┌──────────────────┐
                    │ DELETE IMAGE ID  │
                    └─────────┬────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
    ┌─────────▼────────┐  ┌───▼──────────┐  ┌─▼──────────────┐
    │ REMOVE FROM      │  │ DELETE FROM  │  │ DELETE FROM    │
    │ OBJECT STORAGE   │  │ IMAGE TABLE  │  │ CACHE/REDIS    │
    │                  │  │              │  │                │
    │ images/{name}    │  │ image_id     │  │ User uploads   │
    │ thumbnails/{id}  │  │ filename     │  │ cache key      │
    │                  │  │ metadata     │  │                │
    └────────┬─────────┘  └───┬──────────┘  └────────┬───────┘
             │                │                      │
             │                └──────┬───────────────┘
             │                       │
             └──────────────────┬────┘
                                │
                    ┌───────────▼──────────┐
                    │ CREATE AUDIT LOG:    │
                    │ {                    │
                    │  "action": "DELETE"  │
                    │  "user_id": "xxx"    │
                    │  "image_id": "yyy"   │
                    │  "timestamp": "..."  │
                    │ }                    │
                    └────────────────────┘
```

---

## Timeline: Account Deletion

```
TIME    OPERATION                          STATUS
────────────────────────────────────────────────────────────

T+0s    Request DELETE /api/user/account   🔄 Processing
        - Verify user authentication
        - Check deletion request is valid

T+1s    Begin data export (optional)      🔄 In Progress
        - Collect user uploads
        - Prepare ZIP file

T+2s    Start cascade delete              🔄 In Progress
        - Delete image files from MinIO
        - Delete video files from MinIO

T+5s    Delete database records           🔄 In Progress
        - Users table
        - Metadata tables
        - Settings & preferences

T+8s    Clear cache and sessions          🔄 In Progress
        - Invalidate JWT tokens
        - Clear Redis cache
        - Clear session data

T+10s   Create final audit log            ✅ Logged
        - Record account deletion
        - Timestamp & reason

T+11s   Send confirmation email           📧 Sent
        - Account deleted notification
        - Data export link (if requested)

T+12s   Return success response           ✅ Complete
        {
          "success": true,
          "message": "Account deleted",
          "redirect": "/goodbye"
        }

TOTAL TIME: ~12 seconds
REVERSIBLE: ❌ NO (Permanent deletion)
```

---

**Visual Diagrams Generated:** January 28, 2026

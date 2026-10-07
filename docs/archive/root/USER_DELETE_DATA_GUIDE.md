# How Users Delete Uploaded Data

## Overview
Users can delete their uploaded content (images and videos) from the Impact Database through multiple methods. The system has permission-based controls to ensure data integrity and audit compliance.

## Delete Methods

### 1. **Individual Image Deletion via API**

#### Endpoint
```
DELETE /api/images/{filename}
```

#### Prerequisites
- User must be authenticated (JWT token required)
- User must be the owner of the image OR have admin privileges
- Image must be in `pending_review` status (for non-admins)

#### Usage Example
```bash
curl -X DELETE "http://localhost:8000/api/images/photo_001.jpg" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Response
```json
{
  "success": true,
  "message": "Successfully deleted image 'photo_001.jpg'"
}
```

---

### 2. **Permission Rules**

The delete functionality respects role-based access control:

| User Type | Can Delete? | Restrictions |
|-----------|-------------|--------------|
| **Image Owner** | ✅ Yes | Can only delete images in `pending_review` status |
| **Admin** | ✅ Yes | Can delete images in any status |
| **Other Users** | ❌ No | Cannot delete images they don't own |

#### Status Restrictions for Non-Admins
Non-admin users can **only delete** images with these statuses:
- `pending_review` - Images awaiting review
- `null` - No status assigned

Users **cannot delete**:
- ✗ `approved` - Published/approved images
- ✗ `rejected` - Rejected images
- ✗ `archived` - Archived images

---

### 3. **What Gets Deleted**

When an image is deleted, the following are removed:

1. **Image file** from MinIO object storage
2. **Thumbnail** from MinIO object storage (if exists)
3. **Database record** in `image_metadata` table
4. **Audit log entry** created (action: "DELETE")

```sql
-- Database cleanup
DELETE FROM image_metadata WHERE filename = 'image.jpg';
```

---

### 4. **Video Deletion**

**Current Status:** ⚠️ No dedicated video deletion endpoint exists yet

Videos are created in the `video_metadata` table but unlike images:
- No frontend delete UI for videos
- No REST endpoint for video deletion
- Would require admin action or direct database access to delete

**Recommended:**
- Request admin to delete videos
- Or implement similar video delete endpoint (mirror of image deletion)

---

### 5. **Audit Logging**

Every deletion is recorded in the `audit_logs` table:

```json
{
  "record_id": "image-uuid",
  "action": "DELETE",
  "user_id": "user@example.com",
  "change_summary": {
    "filename": "image.jpg",
    "hazard_type": "flood",
    "status": "pending_review"
  },
  "timestamp": "2026-01-28T12:34:56Z"
}
```

**Access:** Only admins can view audit logs at:
```
GET /api/admin/audit-logs
```

---

### 6. **Frontend Implementation Status**

#### Current State
- ✅ **Images:** API endpoint exists (`DELETE /api/images/{filename}`)
- ✅ **Admin portal:** Delete capability available via API
- ⚠️ **User-facing UI:** Limited delete buttons in detail views
- ❌ **Videos:** No dedicated delete endpoint

#### Recommended Frontend Features (Not Yet Implemented)
```tsx
// Example: Delete button in image detail page
<button 
  onClick={() => deleteImage(imageId)}
  className="btn-danger"
>
  Delete Image
</button>

// Confirmation dialog
<ConfirmDialog 
  title="Delete Image?"
  message="This cannot be undone."
  onConfirm={handleDelete}
/>
```

---

### 7. **User Account Deletion**

Users can also delete their **entire account** which removes all associated data:

#### Endpoint
```
DELETE /api/user/account
```

#### What Gets Deleted
- User profile
- All uploaded images and videos
- API tokens
- Settings and preferences
- Activity history

#### Response
```json
{
  "success": true,
  "message": "Account deleted successfully"
}
```

---

### 8. **Admin Bulk Deletion**

Admins can delete multiple users and their data via bulk actions:

#### Endpoint
```
POST /api/admin/users/bulk-action
```

#### Request
```json
{
  "action": "delete",
  "user_ids": ["user1-id", "user2-id"]
}
```

#### Supported Actions
- `delete` - Hard delete users and associated data
- `lock` - Lock user accounts (prevents login)
- `unlock` - Unlock user accounts
- `activate` - Activate user accounts
- `deactivate` - Deactivate user accounts

---

### 9. **Data Export Before Deletion**

Before deleting their account, users should export their data:

#### Endpoint
```
GET /api/user/export
```

#### Response
Returns a downloadable zip file containing:
- All user metadata
- Upload history
- Activity records
- Settings

---

### 10. **API Token Deletion**

Users can revoke API tokens individually:

#### Endpoint
```
DELETE /api/user/tokens/{token_id}
```

#### Usage
```bash
curl -X DELETE "http://localhost:8000/api/user/tokens/token-123" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### 11. **Avatar Deletion**

Users can delete their profile avatar:

#### Endpoint
```
DELETE /api/user/avatar
```

#### Response
```json
{
  "success": true,
  "message": "Avatar deleted successfully"
}
```

---

## Implementation Guide for Developers

### Adding Delete Image Button to Frontend

```typescript
// frontend/src/lib/api.ts
async deleteImage(filename: string): Promise<any> {
  const response = await this.client.delete(
    `/api/images/${encodeURIComponent(filename)}`
  );
  return response.data;
}

// Usage in component
const handleDelete = async (filename: string) => {
  try {
    await imageApi.deleteImage(filename);
    toast.success('Image deleted successfully');
    router.push('/images');
  } catch (error) {
    toast.error('Failed to delete image');
  }
};
```

### Adding Delete Video Endpoint (Recommended)

```python
# app/api/video_upload.py
@router.delete("/videos/{video_id}")
async def delete_video(
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a video and its associated files"""
    # Check permissions (owner or admin)
    # Delete from MinIO
    # Delete from database
    # Create audit log
    # Return success response
```

---

## Error Scenarios

### 401 - Unauthorized
```json
{
  "detail": "Could not validate credentials"
}
```
**Solution:** Login and provide valid JWT token

### 403 - Forbidden (No Permission)
```json
{
  "detail": "You can only delete your own images"
}
```
**Solution:** User can only delete images they own

### 403 - Cannot Delete Approved Images
```json
{
  "detail": "You can only delete images that are pending review"
}
```
**Solution:** Only admins can delete published/approved images

### 404 - Not Found
```json
{
  "detail": "Image with filename 'xyz' not found"
}
```
**Solution:** Image doesn't exist or already deleted

### 500 - Server Error
```json
{
  "detail": "Failed to delete file from storage"
}
```
**Solution:** Contact admin - check MinIO or database connectivity

---

## Security Considerations

✅ **What's Protected:**
- Only owners or admins can delete images
- All deletions are audit logged
- Deleted data is removed from all systems (file storage + database)
- Non-reversible deletion (no undelete option)

⚠️ **Best Practices:**
1. Export data before deleting account
2. Verify you're deleting the correct image
3. Ask admin before deleting approved content
4. Review audit logs for compliance

---

## Summary

| Feature | Status | Access |
|---------|--------|--------|
| Delete personal images (pending_review) | ✅ Ready | Any authenticated user |
| Delete personal images (approved) | ❌ Restricted | Admins only |
| Delete account + all data | ✅ Ready | Any authenticated user |
| Delete videos | ⚠️ API only | Admins only (needs endpoint) |
| Delete API tokens | ✅ Ready | Any authenticated user |
| Delete avatar | ✅ Ready | Any authenticated user |
| Export data before delete | ✅ Ready | Any authenticated user |
| Audit logs | ✅ Ready | Admins only |

---

**Last Updated:** January 28, 2026  
**Implementation Status:** Mostly Complete (Video deletion endpoint recommended)

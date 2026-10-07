# Delete Data - Quick Reference

## For End Users

### Delete Your Images

**Step 1: Find Your Image**
- Go to `/search` or your profile
- Select an image

**Step 2: Delete**
- Click "Delete" button (if visible)
- OR use API: `DELETE /api/images/{filename}`

**Requirements:**
- ✅ You must be logged in
- ✅ You must be the image owner
- ✅ Image must be in `pending_review` status (non-admins)
- ✅ Admins can delete any image

**What Happens:**
- Image file deleted from storage
- Thumbnail deleted
- Database record removed
- Audit log created

---

### Delete Your Account

**⚠️ WARNING: This is permanent and irreversible!**

**Step 1: Export Your Data**
- Go to `/profile/settings`
- Click "Export My Data"
- Download ZIP file

**Step 2: Delete Account**
- Click "Delete Account"
- Confirm deletion
- Account and all data removed

**Deleted Data Includes:**
- ✗ All uploaded images
- ✗ All uploaded videos
- ✗ Profile & settings
- ✗ API tokens
- ✗ Activity history

---

### Delete API Tokens

**Step 1: Go to Settings**
- `/profile/settings` → "API Tokens"

**Step 2: Delete Token**
- Click "Delete" next to token
- Token revoked immediately

**Step 3: Use New Token**
- Generate new token if needed

---

### Delete Avatar

**Step 1: Go to Profile**
- `/profile`

**Step 2: Delete Avatar**
- Click "Delete Avatar" button
- Avatar removed immediately

---

## For Administrators

### Delete User Image

```bash
curl -X DELETE "http://localhost:8000/api/images/filename.jpg" \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

**Permissions Required:**
- ✅ MANAGE_USERS role
- ✅ Admin user

---

### Delete Multiple Users (Bulk Action)

```bash
curl -X POST "http://localhost:8000/api/admin/users/bulk-action" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "delete",
    "user_ids": ["user1-id", "user2-id"]
  }'
```

**Supported Actions:**
- `delete` - Hard delete
- `lock` - Lock account
- `unlock` - Unlock account
- `activate` - Activate account
- `deactivate` - Deactivate account

---

### Check Audit Logs

```bash
curl -X GET "http://localhost:8000/api/admin/audit-logs?action=DELETE" \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

---

## Permission Matrix

| Action | Owner | Admin | Other |
|--------|-------|-------|-------|
| Delete own `pending_review` image | ✅ | ✅ | ❌ |
| Delete own approved image | ❌ | ✅ | ❌ |
| Delete other's image | ❌ | ✅ | ❌ |
| Delete video | ❌ | ✅ | ❌ |
| Delete own account | ✅ | ✅ | ✅ |
| Delete other account | ❌ | ✅ | ❌ |
| View audit logs | ❌ | ✅ | ❌ |

---

## Status Codes

| Code | Meaning | Solution |
|------|---------|----------|
| 200 | Success | Data deleted |
| 400 | Bad Request | Invalid parameters |
| 401 | Unauthorized | Login required |
| 403 | Forbidden | No permission |
| 404 | Not Found | Data doesn't exist |
| 500 | Server Error | Contact admin |

---

## Important Notes

⚠️ **PERMANENT:** Deletion cannot be undone
⚠️ **IRREVERSIBLE:** No restore from backups
✅ **AUDITED:** All deletions logged
✅ **SECURE:** Only authorized users can delete

---

## Troubleshooting

**"You can only delete images that are pending review"**
- Your image is approved/published
- Ask admin to delete, or
- Create new content instead

**"You can only delete your own images"**
- You're trying to delete someone else's image
- Only admins can delete other users' content

**"Unauthorized"**
- Login with valid credentials
- Your session may have expired

**"Image not found"**
- Image already deleted
- Check filename is correct

---

## Data Retention

**Deleted Data:**
- ✗ Removed from storage within seconds
- ✗ Removed from database immediately
- ✗ Removed from cache within minutes

**Audit Logs:**
- ✅ Retained for 90+ days
- ✅ Accessible by admins only
- ✅ Cannot be deleted

---

## Contact Support

**Questions about deletion?**
- Contact your administrator
- Email: support@oceanportal.example.com

**Report a problem?**
- Error deleting data?
- Data not fully deleted?
- File a support ticket with:
  - Image/Video ID
  - Timestamp of attempt
  - Error message

---

**Last Updated:** January 28, 2026

# Image Tagging System Implementation Guide

## Overview

The image tagging system allows images to be:
- **Independently uploadable** - Images can exist without any report
- **Taggable** - Images can have custom tags for organization and discovery
- **Linkable to Reports** - Images can be associated with scientific reports
- **Multi-reportable** - The same image can be tagged for multiple different reports

## Key Features

### 1. **Image Tagging Panel** (`ImageTaggingPanel.tsx`)
Allows users to:
- Search and browse existing images
- Select multiple images for a report
- Add custom tags to each image
- Remove images from the report
- View all linked images with their tags

**Usage:**
```tsx
<ImageTaggingPanel
  reportId={reportId}
  selectedImages={linkedImages}
  onTagsChange={setLinkedImages}
  allowNewTags={true}
/>
```

### 2. **Image Upload with Tags** (`ImageUploadWithTags.tsx`)
Provides a complete upload interface with:
- Drag-and-drop file upload
- File validation (format, size)
- Image preview
- Metadata entry (title, description)
- Tag input with real-time display
- File format and size information

**Features:**
- Supports JPEG, PNG, WebP
- Max file size configurable (default 50MB)
- Instant preview
- Easy tag management
- Validation on both client and server

## Database Schema

### Images Table
```
image_metadata:
  - id (UUID)
  - title (string)
  - filename (string)
  - abstract (string)
  - thumbnail_url (string)
  - upload_date (timestamp)
  - uploader_id (UUID)
  - (existing metadata fields...)
```

### New: Image Tags Table
```
image_tags:
  - id (UUID)
  - image_id (UUID) - FK to image_metadata
  - tag_name (string)
  - created_at (timestamp)
  - created_by (UUID)
```

### New: Image-Report Links Table
```
image_report_links:
  - id (UUID)
  - image_id (UUID) - FK to image_metadata
  - report_id (UUID) - FK to scientific_report
  - linked_at (timestamp)
  - linked_by (UUID)
```

## API Endpoints Required

### Image Tagging APIs

**GET** `/api/images/content/search`
- Search images by title, filename, description
- Query params: `limit`, `sort_by`, `sort_order`
- Returns: List of images with metadata

**POST** `/api/images/{imageId}/tags`
- Add tags to an image
- Body: `{ tags: string[] }`
- Returns: Updated image with tags

**DELETE** `/api/images/{imageId}/tags/{tag}`
- Remove a tag from an image
- Returns: Success/error

**POST** `/api/reports/{reportId}/images`
- Link images to a report
- Body: `{ imageIds: string[], tags: { [imageId]: string[] } }`
- Returns: Created links

**GET** `/api/reports/{reportId}/images`
- Get all images linked to a report
- Returns: List of images with associated tags

**GET** `/api/images/{imageId}/reports`
- Get all reports an image is linked to
- Returns: List of reports

## Component Integration

### In Scientific Report Form

```tsx
import { ImageTaggingPanel } from "@/components/ImageTaggingPanel";

// In component state
const [linkedImages, setLinkedImages] = useState<ImageTag[]>([]);

// In form
<section className="border-t pt-6">
  <ImageTaggingPanel
    reportId={editingReportId}
    selectedImages={linkedImages}
    onTagsChange={setLinkedImages}
    allowNewTags={true}
  />
</section>

// In submit handler
const imageTagData = linkedImages.map(tag => ({
  imageId: tag.imageId,
  tags: tag.tags,
  reportId: editingReportId
}));
```

### In Image Upload Flow

```tsx
import { ImageUploadWithTags } from "@/components/ImageUploadWithTags";

<ImageUploadWithTags
  onUploadComplete={async (imageData) => {
    // Handle upload with tags
    const formData = new FormData();
    formData.append('file', imageData.file);
    formData.append('title', imageData.title);
    formData.append('description', imageData.description);
    formData.append('tags', JSON.stringify(imageData.tags));
    
    await uploadImage(formData);
  }}
  maxFileSize={50}
  allowedFormats={["image/jpeg", "image/png", "image/webp"]}
/>
```

## Tag Examples

Common tags for scientific reports on disasters/impacts:

```
Imagery Type:
- aerial-view
- ground-level
- satellite
- drone-footage

Damage Assessment:
- structural-damage
- flooding
- landslide
- building-collapse

Response Type:
- rescue-operations
- relief-distribution
- debris-clearing
- reconstruction

Geographic:
- urban-area
- rural-area
- coastal
- mountainous

Weather:
- storm-damage
- hurricane
- earthquake
- tsunami-aftermath
```

## Data Flow Diagram

```
User Creates/Edits Report
    ↓
Scientific Report Form Loads
    ↓
ImageTaggingPanel Component
    ├→ Fetches available images
    ├→ Displays search & filter
    └→ User selects & tags images
    ↓
Form Submission
    ├→ Submit report data
    ├→ Submit image-report links
    └→ Submit image tags
    ↓
API Updates
    ├→ Reports table
    ├→ Image-Report links
    └→ Image tags
    ↓
Database Reflects All Changes
```

## Key Design Decisions

1. **Images Are Independent**: Images don't require a report to exist
2. **Many-to-Many Relationship**: One image can be in multiple reports
3. **Flexible Tagging**: Tags are added per image-report combination
4. **Search-First UX**: Users can search existing images before uploading
5. **Batch Linking**: Multiple images can be selected at once
6. **Client Validation**: File validation happens before upload

## Security Considerations

1. **File Validation**: Check MIME types on server
2. **Size Limits**: Enforce maximum file sizes
3. **Permissions**: Only authenticated users can upload/tag
4. **Ownership**: Users can only tag images they uploaded or have permission for
5. **Report Access**: Only authorized users can link images to reports

## Future Enhancements

1. **Smart Tagging**: Auto-suggest tags based on image content
2. **Tag Hierarchy**: Organize tags into categories
3. **Bulk Operations**: Tag multiple images at once
4. **Advanced Search**: Filter by tags, date range, location
5. **Image Collections**: Group related images
6. **Sharing**: Share image collections with other users
7. **Analytics**: Track most-used tags and images

## Testing Checklist

- [ ] Upload image with tags
- [ ] Search existing images
- [ ] Select and tag images for report
- [ ] Remove images from report
- [ ] Verify tags persist
- [ ] Create report with linked images
- [ ] Edit report and modify linked images
- [ ] Delete image that's linked to reports
- [ ] View images for a specific report
- [ ] View all reports an image is linked to
- [ ] File validation (size, format)
- [ ] Drag-and-drop upload
- [ ] Tag input with keyboard (Enter key)

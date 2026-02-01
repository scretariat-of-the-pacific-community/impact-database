# Image Tagging System Architecture

## Data Model Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    SCIENTIFIC REPORT                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ id, title, description, metrics, dates, etc.              │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ 1..* (one report has many images)
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│              IMAGE_REPORT_LINKS (Junction Table)               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ id                                                         │ │
│  │ image_id (FK) → IMAGE_METADATA                            │ │
│  │ report_id (FK) → SCIENTIFIC_REPORT                        │ │
│  │ report_tags (JSON) - Tags specific to this link          │ │
│  │ linked_at, linked_by, notes                               │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ *..* (many images to many reports)
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    IMAGE_METADATA                               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ id, filename, title, thumbnail_url, upload_date, etc.    │ │
│  │ (Independent - doesn't require a report)                  │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ 1..* (one image has many tags)
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                      IMAGE_TAGS                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ id                                                         │ │
│  │ image_id (FK) → IMAGE_METADATA                            │ │
│  │ tag_name (e.g., 'aerial-view', 'structural-damage')      │ │
│  │ tag_category (optional: e.g., 'content-type', 'damage')   │ │
│  │ created_at, created_by                                    │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Component Hierarchy

```
┌────────────────────────────────────────────────────────────┐
│          ScientificReportForm Component                    │
│  (Handles report creation/editing)                         │
└─────────────────────┬──────────────────────────────────────┘
                      │
                      ├─────────────────────────────┐
                      │                             │
                      ▼                             ▼
        ┌──────────────────────────┐  ┌──────────────────────────┐
        │ Form Fields Section       │  │ ImageTaggingPanel        │
        │ - Title                   │  │ - Search images          │
        │ - Description             │  │ - Select images          │
        │ - Dates, Metrics, etc.    │  │ - Add/remove tags        │
        └──────────────────────────┘  │ - Display selected       │
                                      └──────────────────────────┘
                      │                             │
                      └─────────────────┬───────────┘
                                        │
                                        ▼
                          (Form Submission Handler)
                                        │
                        ┌───────────────┼───────────────┐
                        │               │               │
                        ▼               ▼               ▼
                    Report API      Image Link API   Tag API
```

## User Flow Diagram

```
                         START: Create/Edit Report
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
            Fill Report Info              ImageTaggingPanel
            - Title                       - Loads available images
            - Description                 - User searches
            - Metrics                     - User selects images
                    │                           │
                    │                    ┌──────┴──────┐
                    │                    │             │
                    │            For each image:       │
                    │            - Add tags            │
                    │            - View preview        │
                    │            - Remove if needed    │
                    │                    │             │
                    │            Images + Tags         │
                    │            Selected              │
                    │                    │             │
                    └─────────────┬──────┴─────────────┘
                                  │
                            Submit Form
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
            Store Report Data         Create Image Links
            - Report metadata         - image_report_links
            - Timestamps              - image_tags
                                      - Update stats
                                  │
                            ✓ Success
                                  │
                            Redirect/Confirm
```

## API Call Sequence

```
┌─ User opens report form ─┐
│
├─ ImageTaggingPanel mounts
│  └─ GET /api/images/content/search
│     └─ Returns: List of available images
│
├─ User searches images
│  └─ Filters locally (frontend)
│
├─ User selects image(s)
│  └─ Tracks in component state
│
├─ User adds tags
│  └─ Updates component state
│
├─ User submits form
│  ├─ POST /api/reports
│  │  └─ Create scientific report
│  │
│  ├─ POST /api/reports/{reportId}/images
│  │  └─ Create image-report links
│  │  └─ Body: { images: [{ id, tags }] }
│  │
│  └─ Returns: Success
│
└─ Redirect to report view
```

## State Management Flow

```
ScientificReportForm State:
├─ Form Data (react-hook-form)
│  ├─ title
│  ├─ description
│  ├─ reportType
│  ├─ datePublished
│  ├─ metrics (nested)
│  └─ ...
│
└─ LinkedImages State
   ├─ imageId
   ├─ tags: string[]
   └─ reportId

ImageTaggingPanel State:
├─ availableImages: ImageMetadata[]
├─ selectedImageTags: ImageTag[]
├─ selectedImageId: string | null
├─ searchQuery: string
├─ newTag: string
└─ isLoading: boolean

Form Submission:
├─ Gather all form data
├─ Gather linkedImages
├─ POST /api/reports (with linkedImages)
└─ Handle response
```

## Tag Organization Examples

```
Damage-Related Tags:
├─ structural-damage
├─ building-collapse
├─ flooding
├─ landslide
├─ infrastructure-failure
└─ debris-field

Content-Type Tags:
├─ aerial-view
├─ ground-level
├─ satellite
├─ drone-footage
└─ before-after

Location Tags:
├─ urban-area
├─ rural-area
├─ coastal
├─ mountainous
└─ agricultural

Response Tags:
├─ rescue-operations
├─ relief-distribution
├─ debris-clearing
├─ reconstruction
└─ assessment

Event Tags:
├─ hurricane
├─ earthquake
├─ flooding
├─ landslide
├─ wildfire
└─ tsunami
```

## Relationship Summary

```
One Report ──────┐
                 │ 1..*
                 │
            Image Links ───┐ (Many)
                 │         │
                 └────────┼─── One Image (Can exist alone)
                          │
                      1..*│
                          │
                      Image Tags
```

## Benefits of This Architecture

1. **Decoupling**: Images aren't dependent on reports
2. **Reusability**: Same image in multiple reports
3. **Flexibility**: Different tags per report-image combination
4. **Scalability**: Efficient queries with proper indexing
5. **Maintainability**: Clear separation of concerns
6. **Extensibility**: Easy to add new features (statistics, sharing, etc.)

## Performance Optimization

```
Indexes Created:
├─ image_tags(image_id) - Fast image tag lookup
├─ image_tags(tag_name) - Fast tag search
├─ image_report_links(image_id) - Fast image lookup
├─ image_report_links(report_id) - Fast report lookup
└─ image_usage_stats(reports_count) - Fast popular images

Expected Query Times:
├─ Search images: ~50ms (full-text search)
├─ Get image tags: ~5ms
├─ Get report images: ~20ms
└─ Add image to report: ~50ms
```

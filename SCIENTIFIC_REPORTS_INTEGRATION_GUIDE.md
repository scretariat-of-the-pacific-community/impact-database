# Integration Guide: Scientific Reports with Citizen Uploads

## Quick Integration Steps

To add the scientific reports feature to existing image and video detail pages, follow these steps:

### 1. Add Citation Section to Image Detail Page

**File**: `/data/impact-database/frontend/src/app/images/[id]/page.tsx`

Add this import near the top:
```typescript
import { CitedByScientificReports } from "@/components/scientific-reports/CitedByScientificReports";
```

Add this section to your component's JSX (after metadata display, before delete section):
```typescript
{/* Scientific Reports Citations */}
<section className="border-t pt-6 mt-6">
  <h3 className="text-lg font-semibold text-gray-900 mb-4">
    Cited in Scientific Reports
  </h3>
  <CitedByScientificReports contentId={image.id} />
</section>
```

### 2. Add Citation Section to Video Detail Page

**File**: `/data/impact-database/frontend/src/app/videos/[id]/page.tsx`

Same as above:
```typescript
import { CitedByScientificReports } from "@/components/scientific-reports/CitedByScientificReports";
```

Add the section to your JSX:
```typescript
<section className="border-t pt-6 mt-6">
  <h3 className="text-lg font-semibold text-gray-900 mb-4">
    Cited in Scientific Reports
  </h3>
  <CitedByScientificReports contentId={video.id} />
</section>
```

### 3. Register Backend API Routes

**File**: `/data/impact-database/app/main.py`

Add this import at the top with other API imports:
```python
from api.scientific_reports import router as scientific_reports_router
```

Register the router in your FastAPI app:
```python
app.include_router(scientific_reports_router)
```

### 4. Navigation Links (Optional)

Add links to scientific reports in your navigation component:

```typescript
// In your navigation/header component
<Link href="/scientific-reports" className="...">
  Scientific Reports
</Link>

<Link href="/scientific-reports/submit" className="...">
  Submit Report
</Link>
```

## Component Props Reference

### CitedByScientificReports

```typescript
interface CitedByScientificReportsProps {
  contentId: string;  // The ID of the citizen upload (image/video)
}
```

**Behavior:**
- Automatically fetches reports citing this content
- Displays loading spinner while fetching
- Shows error message if fetch fails
- Displays empty state if no citations
- Renders up to 10 reports with infinite scroll potential

### ScientificReportForm

```typescript
interface ScientificReportFormProps {
  onSuccess?: () => void;                      // Called after successful submission
  initialData?: Partial<ScientificReportSubmission>;  // For editing
  editingReportId?: string;                    // Set when editing existing report
}
```

**Behavior:**
- For new reports: omit initialData and editingReportId
- For editing: provide both initialData and editingReportId
- Shows success message and redirects after submission
- Validates required fields with red error text
- Supports editing impact metrics in collapsible section

### CitizenDataLinkingPanel

```typescript
interface CitizenDataLinkingPanelProps {
  onLinksSelected: (links: CitizenDataLink[]) => void;  // Callback with selected links
  selectedLinks?: CitizenDataLink[];           // Pre-selected links
  maxSelections?: number;                      // Default: 50
}
```

**Behavior:**
- Fetches all citizen uploads on mount
- Filters by search and hazard type
- Limits selections to maxSelections
- Shows selection counter
- Returns links with contentId, contentType, citationType, relevanceScore

## API Endpoints Reference

### Create Scientific Report
```http
POST /api/scientific-reports/reports
Content-Type: application/json
Authorization: Bearer <token>

{
  "title": "Impact of Recent Flooding",
  "description": "Assessment of flood damage...",
  "reportType": "assessment",
  "datePublished": "2024-01-15",
  "authorOrganization": "National Research Institute",
  "authorContact": "researcher@example.com",
  "confidenceLevel": "high",
  "peerReviewed": true,
  "dateStart": "2024-01-10",
  "dateEnd": "2024-01-14",
  "metrics": {
    "peopleAffected": 5000,
    "buildingsDamaged": 150,
    "economicLossUsd": 2500000
  },
  "linkedUploads": [
    {
      "contentId": "upload-id-123",
      "contentType": "image",
      "citationType": "evidence",
      "relevanceScore": 0.85,
      "notes": "Shows flood extent in downtown area"
    }
  ]
}
```

### Get Citations for a Citizen Upload
```http
GET /api/scientific-reports/citations/{contentId}
Authorization: Bearer <token>
```

**Response:**
```json
{
  "content_id": "upload-id-123",
  "citation_count": 3,
  "reports": [
    {
      "id": "report-123",
      "title": "Impact Assessment...",
      "reportType": "assessment",
      "datePublished": "2024-01-15",
      "authorOrganization": "Research Institute",
      "peerReviewed": true,
      "linkedDataCount": 12,
      "citationType": "evidence",
      "relevanceScore": 0.85
    }
  ]
}
```

### List Scientific Reports
```http
GET /api/scientific-reports/reports?skip=0&limit=20&report_type=assessment&peer_reviewed=true
Authorization: Bearer <token>
```

**Query Parameters:**
- `skip`: Number of reports to skip (default: 0)
- `limit`: Number of reports per page (default: 20, max: 100)
- `report_type`: Filter by type (scientific|assessment|policy|research)
- `author_org`: Filter by organization name (partial match)
- `peer_reviewed`: Filter by peer review status (true|false)

## Database Migration

After implementing these changes, run Alembic migration:

```bash
# Generate migration
cd /data/impact-database
alembic revision --autogenerate -m "Add scientific reports tables"

# Review migration file (check it looks correct)
cat alembic/versions/[latest_migration].py

# Run migration
alembic upgrade head
```

## Testing Checklist

- [ ] Backend routes register without errors
- [ ] Create new scientific report from `/scientific-reports/submit`
- [ ] Select citizen uploads in linking panel
- [ ] View report details at `/scientific-reports/{id}`
- [ ] See citation on image/video detail page
- [ ] Search/filter reports on listing page
- [ ] Edit report as author
- [ ] Delete report as author (confirm deletion)
- [ ] Publish report as admin/curator
- [ ] Verify permissions: non-author can't edit other reports
- [ ] Check impact metrics display with values
- [ ] Test empty states (no uploads, no citations)
- [ ] Verify error handling (network errors, invalid IDs)

## Troubleshooting

### "Failed to fetch citizen uploads"
- Check backend is running
- Verify imageApi endpoints are accessible
- Check user authentication/authorization

### "Report not found"
- Verify reportId is correct UUID format
- Confirm report exists in database
- Check report's is_published status

### Citizen data not appearing
- Ensure CitizenDataLinkingPanel receives correct API response
- Check network tab for API calls
- Verify ImageMetadata/VideoMetadata tables have data

### Citation not showing on image detail
- Confirm report is_published = true
- Check content_id matches image/video id
- Verify scientific reports API is registered

### Edit form not pre-filling
- Check report fetch is succeeding
- Verify initialData transformation is correct
- Check date format is YYYY-MM-DD (without time)

## Performance Notes

- Citation display uses lazy loading (fetches on demand)
- Citizen data linking panel loads all uploads (consider pagination for huge datasets)
- Report listing uses pagination (10 per page default)
- Search is client-side after initial fetch (fast for <100 results)
- Add server-side search if dataset grows beyond 1000 reports

## Future Enhancements

1. **Bulk import**: Upload multiple reports from CSV/JSON
2. **Export**: Generate PDF with all metrics
3. **Advanced search**: Filter by metric ranges, date range, location
4. **Visualization**: Charts showing impact distribution
5. **Collections**: Group related reports by disaster/theme
6. **Notifications**: Alert users when their data is cited
7. **Versioning**: Track report edit history
8. **Comments**: Allow discussion on reports

---

**Integration Time**: ~15 minutes
**Files Modified**: 2-4 (depending on existing structure)
**Database Migrations**: 1 (auto-generated)

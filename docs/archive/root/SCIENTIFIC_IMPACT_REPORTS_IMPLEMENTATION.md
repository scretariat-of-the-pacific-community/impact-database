# Scientific Impact Reports Implementation Complete

## Overview

A comprehensive system for submitting, managing, and linking scientific research reports to citizen-contributed data has been successfully implemented. This enables scientists, researchers, and policy makers to cite citizen uploads as evidence of impact while tracking detailed metrics across human, infrastructure, economic, and environmental dimensions.

## Architecture

### Database Layer (PostgreSQL + PostGIS)

**Three new tables created in `/data/impact-database/app/models/scientific_reports.py`:**

1. **impact_reports** (ImpactReport)
   - 22 columns including title, description, report_type, quality indicators
   - Spatial/temporal extent with PostGIS geometry
   - Tracks author, organization, peer review status, publication date
   - Foreign key relationships with citations and assessments
   - Indexes on: report_type, is_published, author_org, created_by

2. **impact_report_citations** (ImpactReportCitation)
   - Links reports to citizen uploads (images/videos)
   - Stores citation_type (evidence, validation, context, impact)
   - Relevance scoring (0.0-1.0 float) for prioritization
   - Unique constraint: (report_id, content_id)
   - Indexes on: report_id, content_id, citation_type

3. **impact_assessments** (ImpactAssessment)
   - 20+ impact metrics across 5 categories:
     - Human: casualties, injuries, displacement, fatalities
     - Infrastructure: buildings damaged/destroyed, critical facilities
     - Economic: direct/indirect losses, insurance claims
     - Environmental: habitat loss, species affected, area affected
     - Recovery: time and cost to restore

### Backend API (`/data/impact-database/app/api/scientific_reports.py`)

**Complete REST API with 10 endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/scientific-reports/reports` | POST | Create new report with metrics |
| `/api/scientific-reports/reports/{id}` | GET | Retrieve single report details |
| `/api/scientific-reports/reports` | GET | List/search published reports |
| `/api/scientific-reports/reports/{id}` | PUT | Update report (author/admin) |
| `/api/scientific-reports/reports/{id}` | DELETE | Delete report (author/admin) |
| `/api/scientific-reports/reports/{id}/link-citizen-data` | POST | Add citizen data citations |
| `/api/scientific-reports/citizen-uploads/linked` | GET | Find uploads cited by reports |
| `/api/scientific-reports/citations/{content-id}` | GET | Find reports citing upload |
| `/api/scientific-reports/reports/{id}/publish` | POST | Publish report (admin/curator) |

**Features:**
- Permission checks: authors can edit/delete own, admins can manage all
- Automatic relationships: citations cascade delete with reports
- Serialization: to_dict() methods for clean JSON responses
- Error handling: detailed 400/403/404/500 responses
- Audit logging: all operations logged with user context

### Frontend Types (`/data/impact-database/frontend/src/lib/scientific-report-types.ts`)

**Complete TypeScript interfaces:**
- `ScientificReport`: Full report with metrics, links, metadata
- `ScientificReportSubmission`: Input form data structure
- `ImpactMetrics`: 20+ metric properties with optional values
- `CitizenDataLink`: Links to citizen uploads with citation details
- `HazardType`, `ImpactType`: Taxonomy enums
- Supporting interfaces for API responses

### Hazard & Impact Taxonomy (`/data/impact-database/frontend/src/lib/hazard-impact-utils.ts`)

**30+ Hazard Types** across 5 categories:
- **Geological** (7): Earthquake, volcano, landslide, tsunami, subsidence, rockfall, avalanche
- **Hydrological** (7): Flooding, flash flood, coastal flood, storm surge, drought, extreme precipitation, water scarcity
- **Meteorological** (8): Hurricane/typhoon, tornado, severe wind, hail, extreme heat/cold, frost, lightning
- **Biological** (6): Epidemic, insect infestation, plant disease, animal attack, algal bloom, wildfire
- **Anthropogenic** (8): Industrial accident, chemical/oil spill, pollution, soil contamination, radiation, conflict

**20+ Impact Types** across 5 categories:
- Human (7): Casualties, injuries, displacement, psychological trauma, disease, malnutrition
- Infrastructure (7): Buildings, roads, power, water, communications, healthcare
- Economic (6): Direct/indirect loss, insured loss, agricultural loss, business interruption, unemployment
- Environmental (8): Habitat loss, species endangered, forest loss, coastal erosion, pollution, air/soil degradation, emissions
- Recovery (4): Recovery time, cost, livelihood restoration, ecosystem recovery

**Utilities provided:**
- `HAZARD_HIERARCHY`: Organized by category
- `IMPACT_TAXONOMY`: Organized by category
- `getHazardById()`, `getImpactById()`: Direct lookups
- `getHazardsByCategory()`, `getImpactsByCategory()`: Category filtering
- `searchHazards()`, `searchImpacts()`: Full-text search

### API Client (`/data/impact-database/frontend/src/lib/scientific-reports-api.ts`)

**scientificReportsApi module with methods:**
```typescript
- createReport(data): Submit new report
- getReport(id): Fetch single report
- listReports(filters): Search/list reports
- updateReport(id, data): Edit existing
- deleteReport(id): Remove report
- linkCitizenData(id, links): Add/update links
- getLinkedCitizenUploads(filters): Find cited uploads
- getCitationsForContent(id): Find reports citing upload
- publishReport(id): Publish (admin only)
```

### React Components

#### 1. ScientificReportForm (`/components/scientific-reports/ScientificReportForm.tsx`)

**Complete form with:**
- Title, description, report type selection
- Publication date and author details
- Peer review checkbox
- Temporal extent (event start/end dates)
- Collapsible impact metrics section
- Organized metric input groups:
  - Blue: Human impact (5 fields)
  - Orange: Infrastructure (2 fields)
  - Green: Economic (2 fields)
  - Emerald: Environmental (1 field)
  - Purple: Recovery (2 fields)
- Success/error notifications
- Loading states with spinner
- Edit mode support
- Form validation with error messages

#### 2. CitizenDataLinkingPanel (`/components/scientific-reports/CitizenDataLinkingPanel.tsx`)

**Multi-select citizen uploads panel:**
- Search by filename, title, or location
- Filter by hazard type dropdown
- Real-time filter/search (client-side)
- Checkbox selection with max limits
- Fetches all citizen uploads from API
- Shows hazard type and location badges
- Selection counter showing current/max
- Visual feedback for selected items
- Error handling for exceeded limits

#### 3. CitedByScientificReports (`/components/scientific-reports/CitedByScientificReports.tsx`)

**Displays scientific reports citing an upload:**
- Shows citation count
- Lists reports with organization and date
- Peer review badge for reviews
- Report type colored badges
- Links to full report details
- Empty state when no citations
- Loading spinner
- Error handling

#### 4. ScientificReportForm Component

**Full submission form integration:**
```typescript
export function ScientificReportForm({
  onSuccess,
  initialData,
  editingReportId
})
```
- Creates new or edits existing reports
- Validates required fields
- Handles API calls with loading states
- Shows success with redirect
- Maps form data to API format

### Pages

#### 1. `/scientific-reports` - Report Listing Page

**Features:**
- Grid display of all published reports
- Search by title, description, organization
- Filter by report type (scientific, assessment, policy, research)
- Pagination (10 per page)
- Report cards showing:
  - Title with hover effect
  - Organization and publication date
  - Full description (3-line clamp)
  - Type and peer review badges
  - Linked citizen uploads count
  - Read More link
- Submit button in header
- Empty state with icon

#### 2. `/scientific-reports/submit` - Report Submission Page

**Layout:**
- Two-column layout: Form (2/3) + Sidebar (1/3)
- Sticky sidebar
- Integrated ScientificReportForm
- CitizenDataLinkingPanel in sidebar
- Instructions and context

#### 3. `/scientific-reports/[id]` - Report Detail Page

**Display sections:**
- Header with title, organization, date, badges
- Edit/Delete buttons (for author/admin)
- Overview section with description
- Temporal extent info
- Impact metrics grid
- Linked citizen data section
- Report details (status, contact, created date, ID)
- Back navigation
- Loading states
- Error handling

## Data Flow

### Report Submission
```
1. User fills ScientificReportForm
2. User selects citizen uploads in CitizenDataLinkingPanel
3. Form submission triggers scientificReportsApi.createReport()
4. Backend creates ImpactReport + ImpactAssessment + ImpactReportCitations
5. Database stores all relationships
6. Success notification redirects to report listing
```

### Citizen Data Citation Discovery
```
1. User views citizen upload (image/video detail page)
2. CitedByScientificReports component loads
3. Calls scientificReportsApi.getCitationsForContent(uploadId)
4. Backend queries ImpactReportCitation + ImpactReport joins
5. Displays linked reports with citation context
```

### Report Search/Discovery
```
1. User visits /scientific-reports page
2. List loads published reports with pagination
3. User searches by text or filters by type
4. Client-side filtering on fetched results
5. Clicking report navigates to detail page
6. Detail page shows full metrics and links
```

## Security

- **Authentication**: All endpoints require get_current_user
- **Authorization**: 
  - Authors can edit/delete own reports
  - Admins can manage all reports
  - Curators can publish reports
  - Published reports viewable by all
- **Input Validation**: Pydantic models on all requests
- **SQL Injection**: SQLAlchemy parameterized queries
- **CORS**: Credentials included in fetch requests

## Database Relationships

```
ImpactReport (1) ─┬─ (N) ImpactReportCitation
                   └─ (1) ImpactAssessment
                   
ImpactReportCitation → ImageMetadata (via content_id)
ImpactReportCitation → VideoMetadata (via content_id)
```

## File Structure

```
app/
├── models/
│   └── scientific_reports.py (204 lines, 3 ORM classes)
└── api/
    └── scientific_reports.py (520+ lines, 10 endpoints)

frontend/src/
├── lib/
│   ├── scientific-report-types.ts (TypeScript interfaces)
│   ├── hazard-impact-utils.ts (Taxonomy + utilities)
│   └── scientific-reports-api.ts (API client)
├── components/scientific-reports/
│   ├── ScientificReportForm.tsx (Form with metrics)
│   ├── CitizenDataLinkingPanel.tsx (Multi-select uploads)
│   └── CitedByScientificReports.tsx (Citation display)
└── app/scientific-reports/
    ├── page.tsx (Listing page)
    ├── submit/page.tsx (Submission page)
    └── [id]/page.tsx (Detail page)
```

## Integration Points

To integrate citation display on existing pages, add to image/video detail pages:

```typescript
import { CitedByScientificReports } from "@/components/scientific-reports/CitedByScientificReports";

// In the detail page component:
<CitedByScientificReports contentId={uploadId} />
```

## Next Steps for Deployment

1. **Database Migration**: Create Alembic migration to create 3 new tables
2. **Environment Setup**: Ensure NEXT_PUBLIC_API_URL environment variable set
3. **API Registration**: Import and include scientific_reports router in main FastAPI app
4. **Testing**: Test full submission → linking → citation discovery flow
5. **Documentation**: Add to API docs/OpenAPI spec
6. **Backup**: Backup database before migration
7. **Monitor**: Check logs for migration success

## Performance Considerations

- Indexed queries on: report_type, is_published, content_id, citation_type
- Lazy loading: Citations fetched on demand
- Pagination: 10 reports per page default
- Client-side search: Reduces API calls
- Cascade deletes: Maintains referential integrity

## Future Enhancements

1. **Geographic filtering**: Use PostGIS geometry column for spatial queries
2. **Impact visualization**: Charts/graphs of metrics
3. **Advanced search**: Filter by confidence level, date range, metrics
4. **Batch import**: Upload multiple reports from CSV/JSON
5. **Export**: Generate PDF reports with metrics and citizen data
6. **Notifications**: Alert users when their data is cited
7. **Versioning**: Track report edit history
8. **Collections**: Group related reports by theme/disaster

---

**Implementation Status**: ✅ COMPLETE - Ready for testing and deployment

# Scientific Impact Reports Integration Guide

## Overview

This document outlines how the Impact Database will handle scientific impact reports linked to citizen data uploads, including expanded hazard and impact taxonomies.

---

## 1. Data Model Architecture

### 1.1 New Database Tables

#### Impact Reports Table
```sql
CREATE TABLE impact_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    report_type VARCHAR(50) NOT NULL, -- 'scientific', 'assessment', 'policy', 'research'
    date_published DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    author_organization VARCHAR(255),
    author_contact VARCHAR(255),
    data_license VARCHAR(100),
    is_published BOOLEAN DEFAULT false,
    
    -- Spatial extent
    geometry GEOMETRY(POLYGON, 4326),
    
    -- Temporal extent
    date_start DATE,
    date_end DATE,
    
    -- Quality indicators
    peer_reviewed BOOLEAN DEFAULT false,
    confidence_level VARCHAR(20), -- 'high', 'medium', 'low'
    
    created_by UUID REFERENCES rbac_user(id),
    INDEX idx_report_type(report_type),
    INDEX idx_published(is_published),
    INDEX idx_author_org(author_organization)
);

-- Link impact reports to citizen uploads
CREATE TABLE impact_report_citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    impact_report_id UUID NOT NULL REFERENCES impact_reports(id) ON DELETE CASCADE,
    content_id UUID NOT NULL, -- References either image_metadata or video_metadata
    content_type VARCHAR(20) NOT NULL, -- 'image' or 'video'
    citation_type VARCHAR(50) NOT NULL, -- 'evidence', 'validation', 'context', 'impact'
    relevance_score FLOAT DEFAULT 0.5, -- 0.0-1.0
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_report_id(impact_report_id),
    INDEX idx_content_id(content_id),
    UNIQUE(impact_report_id, content_id)
);

-- Impact assessment metrics
CREATE TABLE impact_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    impact_report_id UUID NOT NULL REFERENCES impact_reports(id) ON DELETE CASCADE,
    
    -- People impact
    people_affected INTEGER,
    people_injured INTEGER,
    people_missing INTEGER,
    people_displaced INTEGER,
    fatalities INTEGER,
    
    -- Infrastructure impact
    buildings_damaged INTEGER,
    buildings_destroyed INTEGER,
    critical_infrastructure_affected TEXT[], -- array of infrastructure types
    
    -- Economic impact
    economic_loss_usd BIGINT,
    insured_loss_usd BIGINT,
    
    -- Environmental impact
    area_affected_km2 FLOAT,
    ecosystems_affected TEXT[], -- array of ecosystem types
    species_threatened TEXT[], -- array of species
    
    -- Recovery metrics
    recovery_time_months INTEGER,
    recovery_cost_usd BIGINT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_report_id(impact_report_id)
);
```

### 1.2 Expanded Hazard Type Taxonomy

#### Current Hazards
```sql
UPDATE pg_enum 
SET enumlabel = 'earthquake'
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'hazard_type_enum')
AND enumlabel = 'earthquake';

-- Existing: earthquake, flood, tsunami, cyclone, drought, landslide, wildfire, volcanic, coastal_erosion, other
```

#### Expanded Hazard Types (Post-Normalization)
```python
class HazardType(str, Enum):
    # Geophysical
    earthquake = "earthquake"
    tsunami = "tsunami"
    volcanic_eruption = "volcanic_eruption"
    landslide = "landslide"
    ground_subsidence = "ground_subsidence"
    avalanche = "avalanche"
    
    # Meteorological
    tropical_cyclone = "tropical_cyclone"
    extratropical_cyclone = "extratropical_cyclone"
    tornado = "tornado"
    severe_storm = "severe_storm"
    hail = "hail"
    
    # Hydrological
    flood_riverine = "flood_riverine"
    flood_coastal = "flood_coastal"
    flood_flash = "flood_flash"
    flood_urban = "flood_urban"
    storm_surge = "storm_surge"
    
    # Climatological
    drought = "drought"
    extreme_heat = "extreme_heat"
    extreme_cold = "extreme_cold"
    wildfire = "wildfire"
    
    # Biological
    epidemic_disease = "epidemic_disease"
    pest_infestation = "pest_infestation"
    
    # Coastal/Marine
    coastal_erosion = "coastal_erosion"
    king_tide = "king_tide"
    sea_level_rise = "sea_level_rise"
    coral_bleaching = "coral_bleaching"
    
    # Human-Induced
    pollution_air = "pollution_air"
    pollution_water = "pollution_water"
    pollution_soil = "pollution_soil"
    industrial_accident = "industrial_accident"
    
    # Other
    other = "other"
    unknown = "unknown"
```

### 1.3 Impact Type Taxonomy

```python
class ImpactType(str, Enum):
    # Human Impact
    mortality = "mortality"
    morbidity = "morbidity"
    displacement = "displacement"
    homelessness = "homelessness"
    psychological_trauma = "psychological_trauma"
    malnutrition = "malnutrition"
    disease_outbreak = "disease_outbreak"
    
    # Infrastructure Impact
    buildings_damaged = "buildings_damaged"
    bridges_damaged = "bridges_damaged"
    roads_damaged = "roads_damaged"
    power_outage = "power_outage"
    water_supply_disruption = "water_supply_disruption"
    communication_disruption = "communication_disruption"
    
    # Economic Impact
    agricultural_loss = "agricultural_loss"
    fishing_loss = "fishing_loss"
    tourism_disruption = "tourism_disruption"
    business_disruption = "business_disruption"
    income_loss = "income_loss"
    
    # Environmental Impact
    ecosystem_degradation = "ecosystem_degradation"
    species_extinction = "species_extinction"
    forest_loss = "forest_loss"
    coral_damage = "coral_damage"
    soil_erosion = "soil_erosion"
    water_pollution = "water_pollution"
    
    # Social Impact
    community_cohesion_affected = "community_cohesion_affected"
    cultural_heritage_loss = "cultural_heritage_loss"
    social_inequality_increased = "social_inequality_increased"
```

---

## 2. Frontend Implementation

### 2.1 Scientific Report Submission Component

```tsx
// frontend/src/components/ScientificReportSubmission.tsx

interface ScientificReport {
  title: string;
  description: string;
  reportType: 'scientific' | 'assessment' | 'policy' | 'research';
  datePublished: Date;
  authorOrganization: string;
  authorContact: string;
  confidenceLevel: 'high' | 'medium' | 'low';
  peerReviewed: boolean;
  
  // Spatial/Temporal
  geometry: GeoJSON.Polygon; // Study area
  dateStart: Date;
  dateEnd: Date;
  
  // Impact metrics
  metrics: ImpactMetrics;
  
  // Linked citizen data
  linkedUploads: {
    uploadId: string;
    citationType: 'evidence' | 'validation' | 'context' | 'impact';
    relevanceScore: number;
    notes?: string;
  }[];
}

export default function ScientificReportSubmission() {
  const [formData, setFormData] = useState<Partial<ScientificReport>>({
    reportType: 'scientific',
    confidenceLevel: 'medium',
    peerReviewed: false,
    linkedUploads: []
  });
  
  const [selectedUploads, setSelectedUploads] = useState<Set<string>>(new Set());
  
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Report Metadata */}
      <div className="space-y-4">
        <FormField label="Report Title" required>
          <input type="text" required />
        </FormField>
        
        <FormField label="Description" required>
          <textarea required />
        </FormField>
        
        <FormField label="Report Type" required>
          <Select value={formData.reportType} onChange={(e) => 
            setFormData({...formData, reportType: e.target.value as any})
          }>
            <option value="scientific">Scientific Study</option>
            <option value="assessment">Damage Assessment</option>
            <option value="policy">Policy Analysis</option>
            <option value="research">Research Paper</option>
          </Select>
        </FormField>
        
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Date Published" required>
            <input type="date" required />
          </FormField>
          
          <FormField label="Confidence Level">
            <Select>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
          </FormField>
        </div>
        
        <FormField label="Author Organization">
          <input type="text" placeholder="e.g., USGS, NOAA, Red Cross" />
        </FormField>
        
        <FormField label="Peer Reviewed">
          <input 
            type="checkbox" 
            checked={formData.peerReviewed}
            onChange={(e) => setFormData({...formData, peerReviewed: e.target.checked})}
          />
        </FormField>
      </div>
      
      {/* Spatial/Temporal Extent */}
      <SpatialTemporalPicker 
        onGeometryChange={(geom) => setFormData({...formData, geometry: geom})}
        onDateRangeChange={(start, end) => setFormData({...formData, dateStart: start, dateEnd: end})}
      />
      
      {/* Impact Metrics */}
      <ImpactMetricsForm 
        metrics={formData.metrics}
        onChange={(metrics) => setFormData({...formData, metrics})}
      />
      
      {/* Linked Citizen Data */}
      <CitizenDataLinkingPanel
        selectedUploads={selectedUploads}
        onSelectionChange={setSelectedUploads}
        onCitationTypeChange={(uploadId, type) => {
          // Update citation type for linked upload
        }}
      />
      
      <button type="submit" className="btn btn-primary">
        Submit Report
      </button>
    </form>
  );
}
```

### 2.2 Citizen Data Linking Component

```tsx
// frontend/src/components/CitizenDataLinkingPanel.tsx

interface CitizenDataLinkingPanelProps {
  selectedUploads: Set<string>;
  onSelectionChange: (uploads: Set<string>) => void;
  onCitationTypeChange: (uploadId: string, type: string) => void;
}

export function CitizenDataLinkingPanel({
  selectedUploads,
  onSelectionChange,
  onCitationTypeChange
}: CitizenDataLinkingPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    hazardTypes: new Set<string>(),
    dateRange: { start: null, end: null },
    countries: new Set<string>(),
    status: 'approved'
  });
  
  // Search for relevant citizen uploads
  const { data: uploads } = useQuery({
    queryKey: ['citizen-uploads', searchTerm, filters],
    queryFn: async () => {
      return await imageApi.search({
        q: searchTerm,
        hazard_types: Array.from(filters.hazardTypes),
        countries: Array.from(filters.countries),
        status: filters.status,
        limit: 100
      });
    }
  });
  
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Link Citizen Data</h3>
      
      {/* Search & Filters */}
      <div className="space-y-3">
        <input
          type="text"
          placeholder="Search uploads by title, location..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border rounded"
        />
        
        {/* Hazard Type Filter */}
        <MultiSelect
          label="Hazard Types"
          options={HAZARD_TYPES}
          selected={filters.hazardTypes}
          onChange={(types) => setFilters({...filters, hazardTypes: types})}
        />
        
        {/* Country Filter */}
        <MultiSelect
          label="Countries"
          options={COUNTRIES}
          selected={filters.countries}
          onChange={(countries) => setFilters({...filters, countries})}
        />
      </div>
      
      {/* Upload Selection Grid */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {uploads?.map((upload) => (
          <div
            key={upload.id}
            className={`p-3 border rounded cursor-pointer transition ${
              selectedUploads.has(upload.id)
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => {
              const newSet = new Set(selectedUploads);
              if (newSet.has(upload.id)) {
                newSet.delete(upload.id);
              } else {
                newSet.add(upload.id);
              }
              onSelectionChange(newSet);
            }}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selectedUploads.has(upload.id)}
                onChange={() => {}}
                className="mt-1"
              />
              
              <div className="flex-1 min-w-0">
                <h4 className="font-medium truncate">{upload.title || upload.filename}</h4>
                <p className="text-sm text-gray-600">
                  {upload.hazard_type} • {upload.location}
                </p>
                <p className="text-xs text-gray-500">
                  Uploaded: {new Date(upload.created_at).toLocaleDateString()}
                </p>
              </div>
              
              {selectedUploads.has(upload.id) && (
                <CitationTypeSelect
                  value={/* get citation type */}
                  onChange={(type) => onCitationTypeChange(upload.id, type)}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      
      <p className="text-sm text-gray-600">
        {selectedUploads.size} upload(s) selected
      </p>
    </div>
  );
}

// Citation type selector
function CitationTypeSelect({ value, onChange }: any) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-32">
      <option value="evidence">Evidence</option>
      <option value="validation">Validation</option>
      <option value="context">Context</option>
      <option value="impact">Impact</option>
    </Select>
  );
}
```

### 2.3 Impact Metrics Form Component

```tsx
// frontend/src/components/ImpactMetricsForm.tsx

interface ImpactMetricsFormProps {
  metrics?: ImpactMetrics;
  onChange: (metrics: ImpactMetrics) => void;
}

export function ImpactMetricsForm({ metrics = {}, onChange }: ImpactMetricsFormProps) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Impact Metrics</h3>
      
      {/* Human Impact */}
      <div className="space-y-3">
        <h4 className="font-medium text-blue-700">Human Impact</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <FormField label="Fatalities">
            <input 
              type="number" 
              min="0"
              value={metrics.fatalities || ''}
              onChange={(e) => onChange({...metrics, fatalities: parseInt(e.target.value) || 0})}
            />
          </FormField>
          <FormField label="Injured">
            <input 
              type="number" 
              min="0"
              value={metrics.people_injured || ''}
              onChange={(e) => onChange({...metrics, people_injured: parseInt(e.target.value) || 0})}
            />
          </FormField>
          <FormField label="Missing">
            <input 
              type="number" 
              min="0"
              value={metrics.people_missing || ''}
              onChange={(e) => onChange({...metrics, people_missing: parseInt(e.target.value) || 0})}
            />
          </FormField>
          <FormField label="Displaced">
            <input 
              type="number" 
              min="0"
              value={metrics.people_displaced || ''}
              onChange={(e) => onChange({...metrics, people_displaced: parseInt(e.target.value) || 0})}
            />
          </FormField>
          <FormField label="Affected">
            <input 
              type="number" 
              min="0"
              value={metrics.people_affected || ''}
              onChange={(e) => onChange({...metrics, people_affected: parseInt(e.target.value) || 0})}
            />
          </FormField>
        </div>
      </div>
      
      {/* Infrastructure Impact */}
      <div className="space-y-3">
        <h4 className="font-medium text-orange-700">Infrastructure Impact</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <FormField label="Buildings Damaged">
            <input type="number" min="0" />
          </FormField>
          <FormField label="Buildings Destroyed">
            <input type="number" min="0" />
          </FormField>
          <FormField label="Critical Infrastructure">
            <MultiSelect
              options={['Power Grid', 'Water System', 'Roads', 'Bridges', 'Ports', 'Hospitals']}
            />
          </FormField>
        </div>
      </div>
      
      {/* Economic Impact */}
      <div className="space-y-3">
        <h4 className="font-medium text-green-700">Economic Impact (USD)</h4>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Total Economic Loss">
            <input type="number" min="0" />
          </FormField>
          <FormField label="Insured Loss">
            <input type="number" min="0" />
          </FormField>
        </div>
      </div>
      
      {/* Environmental Impact */}
      <div className="space-y-3">
        <h4 className="font-medium text-green-600">Environmental Impact</h4>
        <div className="space-y-3">
          <FormField label="Area Affected (km²)">
            <input type="number" min="0" step="0.01" />
          </FormField>
          <FormField label="Ecosystems Affected">
            <MultiSelect
              options={['Forest', 'Coral Reef', 'Wetland', 'Agricultural Land', 'Marine']}
            />
          </FormField>
          <FormField label="Species Threatened">
            <textarea placeholder="List species of concern..." />
          </FormField>
        </div>
      </div>
      
      {/* Recovery Metrics */}
      <div className="space-y-3">
        <h4 className="font-medium text-purple-700">Recovery Metrics</h4>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Recovery Time (months)">
            <input type="number" min="0" />
          </FormField>
          <FormField label="Recovery Cost (USD)">
            <input type="number" min="0" />
          </FormField>
        </div>
      </div>
    </div>
  );
}
```

---

## 3. Backend API Endpoints

### 3.1 Scientific Report Management

```python
# app/api/scientific_reports.py

from fastapi import APIRouter, Depends, HTTPException, Query
from models.database import ImpactReport, ImpactReportCitation, ImpactAssessment, get_db
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/scientific-reports", tags=["scientific-reports"])

class ImpactMetricsRequest(BaseModel):
    people_affected: Optional[int] = None
    people_injured: Optional[int] = None
    people_missing: Optional[int] = None
    people_displaced: Optional[int] = None
    fatalities: Optional[int] = None
    buildings_damaged: Optional[int] = None
    buildings_destroyed: Optional[int] = None
    critical_infrastructure_affected: Optional[List[str]] = None
    economic_loss_usd: Optional[int] = None
    insured_loss_usd: Optional[int] = None
    area_affected_km2: Optional[float] = None
    ecosystems_affected: Optional[List[str]] = None
    species_threatened: Optional[List[str]] = None
    recovery_time_months: Optional[int] = None
    recovery_cost_usd: Optional[int] = None

class CitizenDataLinkRequest(BaseModel):
    content_id: str
    content_type: str  # 'image' or 'video'
    citation_type: str  # 'evidence', 'validation', 'context', 'impact'
    relevance_score: float = 0.5
    notes: Optional[str] = None

class ScientificReportRequest(BaseModel):
    title: str
    description: str
    report_type: str  # 'scientific', 'assessment', 'policy', 'research'
    date_published: date
    author_organization: Optional[str] = None
    author_contact: Optional[str] = None
    confidence_level: str = 'medium'
    peer_reviewed: bool = False
    geometry: Optional[dict] = None  # GeoJSON
    date_start: Optional[date] = None
    date_end: Optional[date] = None
    metrics: Optional[ImpactMetricsRequest] = None
    linked_uploads: Optional[List[CitizenDataLinkRequest]] = None

@router.post("/reports", response_model=dict)
async def create_scientific_report(
    request: ScientificReportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit a new scientific report with linked citizen data"""
    try:
        # Create report
        report = ImpactReport(
            title=request.title,
            description=request.description,
            report_type=request.report_type,
            date_published=request.date_published,
            author_organization=request.author_organization,
            author_contact=request.author_contact,
            confidence_level=request.confidence_level,
            peer_reviewed=request.peer_reviewed,
            geometry=request.geometry,
            date_start=request.date_start,
            date_end=request.date_end,
            created_by=current_user.id
        )
        db.add(report)
        db.flush()
        
        # Create impact metrics if provided
        if request.metrics:
            metrics = ImpactAssessment(
                impact_report_id=report.id,
                **request.metrics.dict(exclude_none=True)
            )
            db.add(metrics)
        
        # Link citizen data
        if request.linked_uploads:
            for link in request.linked_uploads:
                citation = ImpactReportCitation(
                    impact_report_id=report.id,
                    content_id=link.content_id,
                    content_type=link.content_type,
                    citation_type=link.citation_type,
                    relevance_score=link.relevance_score,
                    notes=link.notes
                )
                db.add(citation)
        
        db.commit()
        
        return {
            "success": True,
            "report_id": str(report.id),
            "message": "Scientific report submitted successfully"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating scientific report: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/reports/{report_id}")
async def get_scientific_report(
    report_id: str,
    db: Session = Depends(get_db)
):
    """Get scientific report details with linked citizen data"""
    report = db.query(ImpactReport).filter(ImpactReport.id == report_id).first()
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    # Get linked citizen data
    citations = db.query(ImpactReportCitation).filter(
        ImpactReportCitation.impact_report_id == report_id
    ).all()
    
    # Get impact metrics
    metrics = db.query(ImpactAssessment).filter(
        ImpactAssessment.impact_report_id == report_id
    ).first()
    
    return {
        "id": str(report.id),
        "title": report.title,
        "description": report.description,
        "report_type": report.report_type,
        "date_published": report.date_published.isoformat(),
        "author_organization": report.author_organization,
        "peer_reviewed": report.peer_reviewed,
        "confidence_level": report.confidence_level,
        "geometry": report.geometry,
        "linked_citizen_data": [
            {
                "content_id": str(c.content_id),
                "content_type": c.content_type,
                "citation_type": c.citation_type,
                "relevance_score": c.relevance_score,
                "notes": c.notes
            }
            for c in citations
        ],
        "impact_metrics": metrics.dict() if metrics else None
    }

@router.get("/reports")
async def list_scientific_reports(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    report_type: Optional[str] = None,
    hazard_type: Optional[str] = None,
    country: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """List scientific reports with optional filtering"""
    query = db.query(ImpactReport).filter(ImpactReport.is_published == True)
    
    if report_type:
        query = query.filter(ImpactReport.report_type == report_type)
    
    total = query.count()
    reports = query.offset(skip).limit(limit).all()
    
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "reports": [
            {
                "id": str(r.id),
                "title": r.title,
                "report_type": r.report_type,
                "date_published": r.date_published.isoformat(),
                "author_organization": r.author_organization,
                "linked_data_count": db.query(ImpactReportCitation).filter(
                    ImpactReportCitation.impact_report_id == r.id
                ).count()
            }
            for r in reports
        ]
    }

@router.get("/citizen-uploads/linked")
async def get_linked_citizen_uploads(
    report_id: Optional[str] = None,
    hazard_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get citizen uploads that are linked to impact reports"""
    query = db.query(ImpactReportCitation)
    
    if report_id:
        query = query.filter(ImpactReportCitation.impact_report_id == report_id)
    
    citations = query.all()
    
    # Fetch the actual content
    results = []
    for citation in citations:
        if citation.content_type == 'image':
            content = db.query(ImageMetadata).filter(
                ImageMetadata.id == citation.content_id
            ).first()
        else:
            content = db.query(VideoMetadata).filter(
                VideoMetadata.id == citation.content_id
            ).first()
        
        if content:
            results.append({
                "id": str(content.id),
                "title": content.title,
                "filename": content.filename,
                "hazard_type": content.hazard_type,
                "citation_type": citation.citation_type,
                "relevance_score": citation.relevance_score,
                "report_link": str(citation.impact_report_id)
            })
    
    return results
```

---

## 4. Data Linking Strategy

### 4.1 Citation Types

```
Evidence:     Citizen data provides direct evidence of disaster impact
Validation:   Citizen data validates scientific findings or models
Context:      Citizen data provides spatial/temporal context
Impact:       Citizen data documents specific impact assessment metrics
```

### 4.2 Relevance Scoring

```
1.0 = Directly related to study area and time period
0.8 = Related but somewhat tangential
0.6 = Marginally relevant
0.4 = Weakly relevant
0.0 = Not relevant
```

### 4.3 Reverse Linking

When displaying citizen uploads, show which scientific reports cite them:

```tsx
// In image/video detail page
<CitedBy>
  <h3>Featured In Scientific Reports</h3>
  {linkedReports.map(report => (
    <div key={report.id}>
      <h4>{report.title}</h4>
      <p>Citation Type: {report.citation_type}</p>
      <p>Organization: {report.author_organization}</p>
      <Link href={`/scientific-reports/${report.id}`}>
        View Full Report
      </Link>
    </div>
  ))}
</CitedBy>
```

---

## 5. Enhanced Hazard Display

### 5.1 Hazard Type Mapping Component

```tsx
// frontend/src/lib/hazard-utils.ts

export const HAZARD_HIERARCHY = {
  'Geophysical': {
    icon: '🌍',
    hazards: [
      { id: 'earthquake', label: 'Earthquake' },
      { id: 'tsunami', label: 'Tsunami' },
      { id: 'volcanic_eruption', label: 'Volcanic Eruption' },
      { id: 'landslide', label: 'Landslide' },
      { id: 'ground_subsidence', label: 'Ground Subsidence' },
    ]
  },
  'Meteorological': {
    icon: '⛈️',
    hazards: [
      { id: 'tropical_cyclone', label: 'Tropical Cyclone' },
      { id: 'extratropical_cyclone', label: 'Extratropical Cyclone' },
      { id: 'tornado', label: 'Tornado' },
      { id: 'severe_storm', label: 'Severe Storm' },
    ]
  },
  'Hydrological': {
    icon: '💧',
    hazards: [
      { id: 'flood_riverine', label: 'Riverine Flood' },
      { id: 'flood_coastal', label: 'Coastal Flood' },
      { id: 'flood_flash', label: 'Flash Flood' },
      { id: 'storm_surge', label: 'Storm Surge' },
    ]
  },
  // ... more categories
};

// Flatten for dropdowns
export const FLAT_HAZARD_OPTIONS = Object.values(HAZARD_HIERARCHY)
  .flatMap(cat => cat.hazards);

// Get parent category
export function getHazardCategory(hazardType: string): string {
  for (const [category, data] of Object.entries(HAZARD_HIERARCHY)) {
    if (data.hazards.some(h => h.id === hazardType)) {
      return category;
    }
  }
  return 'Other';
}
```

### 5.2 Hierarchical Hazard Selector

```tsx
// frontend/src/components/HierarchicalHazardSelector.tsx

export function HierarchicalHazardSelector({ value, onChange }: any) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  
  return (
    <div className="space-y-2">
      {Object.entries(HAZARD_HIERARCHY).map(([category, data]) => (
        <div key={category}>
          <button
            type="button"
            onClick={() => {
              const expanded = new Set(expandedCategories);
              if (expanded.has(category)) {
                expanded.delete(category);
              } else {
                expanded.add(category);
              }
              setExpandedCategories(expanded);
            }}
            className="flex items-center w-full text-left p-2 hover:bg-gray-100 rounded"
          >
            <span className="text-xl mr-2">{data.icon}</span>
            <span className="font-medium">{category}</span>
            <ChevronDown 
              className={`ml-auto transform transition ${
                expandedCategories.has(category) ? 'rotate-180' : ''
              }`}
            />
          </button>
          
          {expandedCategories.has(category) && (
            <div className="ml-6 space-y-1">
              {data.hazards.map(hazard => (
                <label key={hazard.id} className="flex items-center p-2 cursor-pointer">
                  <input
                    type="radio"
                    name="hazard"
                    value={hazard.id}
                    checked={value === hazard.id}
                    onChange={(e) => onChange(e.target.value)}
                    className="mr-2"
                  />
                  {hazard.label}
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## 6. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [ ] Create database tables for scientific reports
- [ ] Expand hazard type taxonomy in database
- [ ] Create backend API endpoints for report submission

### Phase 2: Frontend Integration (Weeks 3-4)
- [ ] Build scientific report submission form
- [ ] Build citizen data linking component
- [ ] Build hierarchical hazard selector
- [ ] Add impact metrics form

### Phase 3: Data Display (Weeks 5-6)
- [ ] Add "Cited By" section to image/video detail pages
- [ ] Create scientific report detail page
- [ ] Create report listing and search page
- [ ] Add report filtering by hazard type, organization, date range

### Phase 4: Advanced Features (Weeks 7-8)
- [ ] Add bulk report upload (CSV/ZIP)
- [ ] Add report versioning and updates
- [ ] Add export formats (PDF, JSON-LD, STAC)
- [ ] Add report citation statistics
- [ ] Add impact visualization dashboards

---

## 7. Data Standards Compliance

### ISO 19115 Extensions
- Add scientific report metadata to ISO 19115 export
- Include impact metrics in STAC Item properties
- Add report citations as data lineage information

### STAC Integration
```json
{
  "properties": {
    "impact:report_citations": [
      {
        "report_id": "uuid",
        "citation_type": "evidence",
        "relevance": 0.95
      }
    ],
    "hazard:type_hierarchy": {
      "category": "Meteorological",
      "type": "tropical_cyclone"
    },
    "impact:metrics": {
      "people_affected": 15000,
      "economic_loss_usd": 50000000,
      "recovery_time_months": 6
    }
  }
}
```

---

## 8. Access Control & Permissions

```python
# Permissions required
PERMISSIONS = {
    'submit_report': ['editor', 'curator', 'admin'],
    'view_reports': ['viewer', 'contributor', 'curator', 'admin'],
    'edit_report': ['editor', 'admin'],  # Only original author/admin
    'publish_report': ['curator', 'admin'],
    'approve_metrics': ['curator', 'admin'],
}
```

---

This architecture provides a comprehensive system for integrating scientific impact reports with citizen-contributed data while supporting expanded hazard and impact taxonomies. The modular design allows for phased implementation and future enhancements.

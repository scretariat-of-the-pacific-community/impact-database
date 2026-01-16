# Featured Stories Quality Control Fix

## Issue
The mobile version was showing featured story cards for images that shouldn't be featured - regular user uploads were appearing in the curated "Featured Stories" section.

## Root Cause
1. **Backend API** ([app/api/featured.py](app/api/featured.py)) was fetching ALL approved images with a `resource_locator`, not just curated featured content
2. The API created **fallback titles/descriptions** for images missing this data (e.g., "Impact Event", "Impact imagery from...")
3. **Frontend filtering** was too permissive - it only checked if fields existed, not if they had meaningful content
4. Result: Low-quality or incomplete uploads passed all filters and appeared as "featured stories"

## Solution Implemented

### 1. Backend API Strictness ([app/api/featured.py](app/api/featured.py))
**Changes:**
- ✅ Require actual `title` (not null, not empty)
- ✅ Require either `abstract` OR `purpose` with real content (not null, not empty)
- ✅ Require `location` and `hazard_type` (not null, not empty)
- ✅ Check description length (minimum 50 characters)
- ✅ Removed fallback title/description generation
- ✅ Fetch 2x limit and filter to ensure quality
- ✅ Validate image URL exists before adding

**Before:**
```python
title = img.title or img.location or f"{img.hazard_type or 'Impact'} Event"
description = img.abstract or img.purpose or f"Impact imagery from..."
```

**After:**
```python
# Skip if missing required fields or description too short
if not all([img.title, img.location, img.hazard_type]):
    continue
if len(description.strip()) < 50:
    continue
```

### 2. Frontend Page Filter ([frontend/src/app/page.tsx](frontend/src/app/page.tsx))
**Changes:**
- ✅ Check title length > 10 characters
- ✅ Check description length >= 50 characters
- ✅ Check location length > 3 characters
- ✅ Check hazard type length > 3 characters
- ✅ All conditions must be true (AND logic)
- ✅ Trim whitespace before validation

### 3. Component Filter ([frontend/src/components/FeaturedStories.tsx](frontend/src/components/FeaturedStories.tsx))
**Changes:**
- ✅ Triple-layer validation (backend → page → component)
- ✅ Same strict length checks as page filter
- ✅ Clear variable names for readability

## Quality Requirements
For an image to appear as a "featured story", it must now have:
- ✅ **Title**: Meaningful (>10 chars), not auto-generated
- ✅ **Description**: Detailed (>=50 chars), not generic fallback
- ✅ **Location**: Specific (>3 chars)
- ✅ **Hazard Type**: Valid (>3 chars)
- ✅ **Date**: Valid date string
- ✅ **Image**: Valid URL to display

## Impact
- **Mobile**: No more low-quality or incomplete cards in featured section
- **Desktop**: Same improved quality control
- **Curated Stories**: Static curated content (Tonga, Fiji) always shown
- **API Stories**: Only high-quality user uploads with complete metadata appear
- **Fallback**: If no quality API content exists, shows only curated stories

## Future Enhancement
Add a manual `is_featured` boolean flag to `ImageMetadata` model for admin curation:
```sql
ALTER TABLE image_metadata ADD COLUMN is_featured BOOLEAN DEFAULT FALSE;
```

Then filter by `ImageMetadata.is_featured == True` for explicit curation control.

## Testing
1. Check homepage on mobile/desktop
2. Verify only 2 static curated stories appear (Tonga, Fiji)
3. If API returns user uploads, verify they have complete metadata
4. Incomplete uploads should NOT appear in featured section

## Files Changed
- [app/api/featured.py](app/api/featured.py) - Backend filtering logic
- [frontend/src/app/page.tsx](frontend/src/app/page.tsx) - Frontend filtering logic
- [frontend/src/components/FeaturedStories.tsx](frontend/src/components/FeaturedStories.tsx) - Component filtering logic

# Ocean-Related Hazard Types Extension - February 2, 2026

## Summary

Extended the hazard type taxonomy to include **7 new ocean-related hazards**, bringing the total from 10 to **17 hazard types**.

## New Ocean-Related Hazard Types Added

### 1. **Sea Level Rise** (`sea_level_rise`)
- **Category:** Marine & Coastal
- **Icon:** 📈🌊
- **Description:** Long-term increase in ocean levels due to climate change

### 2. **Storm Surge** (`storm_surge`)
- **Category:** Marine & Coastal / Hydrological
- **Icon:** 🌀🌊
- **Description:** Abnormal rise in seawater level during a storm

### 3. **Ocean Acidification** (`ocean_acidification`)
- **Category:** Marine & Coastal
- **Icon:** 🧪🌊
- **Description:** Decrease in ocean pH due to increased CO2 absorption

### 4. **Coral Bleaching** (`coral_bleaching`)
- **Category:** Marine & Coastal
- **Icon:** 🪸
- **Description:** Loss of coral color and vitality due to stress (temperature, pollution)

### 5. **Marine Heatwave** (`marine_heatwave`)
- **Category:** Marine & Coastal
- **Icon:** 🌡️🌊
- **Description:** Prolonged periods of abnormally warm ocean temperatures

### 6. **King Tide** (`king_tide`)
- **Category:** Marine & Coastal
- **Icon:** 🌙🌊
- **Description:** Exceptionally high tide events (perigean spring tides)

### 7. **Rogue Wave** (`rogue_wave`)
- **Category:** Marine & Coastal
- **Icon:** 🌊⚡
- **Description:** Unexpectedly large and dangerous ocean waves

## Files Updated

### Backend (Python)
- **[app/api/upload.py](app/api/upload.py#L164-L181)** - Updated `HazardType` enum

### Frontend (TypeScript/React)
- **[frontend/src/lib/types.ts](frontend/src/lib/types.ts#L176-L194)** - Updated `HazardType` union type
- **[frontend/src/lib/types.ts](frontend/src/lib/types.ts#L332-L349)** - Updated `HAZARD_TYPE_LABELS` mapping
- **[frontend/src/lib/types.ts](frontend/src/lib/types.ts#L345-L362)** - Updated `HAZARD_TYPES` array
- **[frontend/src/lib/hazard-impact-utils.ts](frontend/src/lib/hazard-impact-utils.ts#L20-L37)** - Added new "Marine & Coastal" category
- **[frontend/src/components/MetadataEditor.tsx](frontend/src/components/MetadataEditor.tsx#L93-L115)** - Updated hazard type options
- **[frontend/src/components/BulkImportExport.tsx](frontend/src/components/BulkImportExport.tsx#L666-L683)** - Updated export filter options
- **[frontend/src/app/images/[id]/edit/page.tsx](frontend/src/app/images/[id]/edit/page.tsx#L756-L801)** - Updated image edit form options

## Complete Hazard Type List (17 Total)

| Value | Label | Category | Icon |
|-------|-------|----------|------|
| `earthquake` | Earthquake | Geological | 🌍 |
| `flood` | Flood | Hydrological | 🌊 |
| `tsunami` | Tsunami | Geological | 🌊 |
| `cyclone` | Cyclone | Meteorological | 🌀 |
| `drought` | Drought | Hydrological | 🏜️ |
| `landslide` | Landslide | Geological | ⛰️ |
| `wildfire` | Wildfire | Biological | 🔥 |
| `volcanic` | Volcanic Activity | Geological | 🌋 |
| `coastal_erosion` | Coastal Erosion | Marine & Coastal | 🏖️ |
| `sea_level_rise` | Sea Level Rise | Marine & Coastal | 📈🌊 |
| `storm_surge` | Storm Surge | Marine & Coastal | 🌀🌊 |
| `ocean_acidification` | Ocean Acidification | Marine & Coastal | 🧪🌊 |
| `coral_bleaching` | Coral Bleaching | Marine & Coastal | 🪸 |
| `marine_heatwave` | Marine Heatwave | Marine & Coastal | 🌡️🌊 |
| `king_tide` | King Tide | Marine & Coastal | 🌙🌊 |
| `rogue_wave` | Rogue Wave | Marine & Coastal | 🌊⚡ |
| `other` | Other | General | - |

## New Hazard Category: "Marine & Coastal"

A new category has been added to the hazard hierarchy with **9 ocean-specific hazards**:

```typescript
"Marine & Coastal": [
  { id: "sea-level-rise", label: "Sea Level Rise", category: "Marine & Coastal", icon: "📈🌊" },
  { id: "coastal-erosion", label: "Coastal Erosion", category: "Marine & Coastal", icon: "🏖️" },
  { id: "king-tide", label: "King Tide", category: "Marine & Coastal", icon: "🌙🌊" },
  { id: "rogue-wave", label: "Rogue Wave", category: "Marine & Coastal", icon: "🌊⚡" },
  { id: "marine-heatwave", label: "Marine Heatwave", category: "Marine & Coastal", icon: "🌡️🌊" },
  { id: "coral-bleaching", label: "Coral Bleaching", category: "Marine & Coastal", icon: "🪸" },
  { id: "ocean-acidification", label: "Ocean Acidification", category: "Marine & Coastal", icon: "🧪🌊" },
  { id: "harmful-algal-bloom", label: "Harmful Algal Bloom", category: "Marine & Coastal", icon: "🦠🌊" },
  { id: "storm-surge", label: "Storm Surge", category: "Marine & Coastal", icon: "🌀🌊" },
]
```

## Pacific Islands Relevance

These ocean-related hazards are **critical for Pacific Island nations** due to:

- **Climate Change Vulnerability:** Rising sea levels and ocean temperatures
- **Coral Reef Ecosystems:** Bleaching events threaten marine biodiversity
- **Coastal Communities:** Storm surges and king tides impact populated areas
- **Marine Resources:** Ocean acidification affects fisheries
- **Extreme Events:** Rogue waves and marine heatwaves increasing in frequency

## Impact

### Users Can Now:
- ✅ Upload and tag images/videos with ocean-specific hazards
- ✅ Filter and search by marine hazard types
- ✅ Track coral bleaching events over time
- ✅ Document sea level rise impacts with visual evidence
- ✅ Monitor marine heatwave effects on ecosystems
- ✅ Record king tide flooding incidents
- ✅ Catalog ocean acidification impacts

### Database Compatibility
- ✅ **Backward Compatible:** Existing data unaffected
- ✅ **No Migration Required:** Hazard types stored as strings
- ✅ **Frontend/Backend Aligned:** Both systems use identical hazard types

## Testing Recommendations

1. **Upload Test:** Upload an image with `coral_bleaching` hazard type
2. **Search Test:** Filter images by `sea_level_rise`
3. **Edit Test:** Change existing image hazard type to `marine_heatwave`
4. **Export Test:** Export data filtered by ocean-related hazards
5. **Bulk Upload:** Test batch upload with multiple ocean hazard types

## Next Steps (Optional)

- [ ] Add hazard-specific metadata fields (e.g., pH levels for ocean acidification)
- [ ] Create ocean hazard dashboard visualizations
- [ ] Add marine hazard educational content
- [ ] Integrate with ocean monitoring APIs (NOAA, etc.)
- [ ] Add hazard severity scales for ocean events

---

**Status:** ✅ Complete
**Generated:** February 2, 2026 11:15 PM UTC
**Changes:** 7 files modified, 7 new hazard types added

# Epic 1.4 – Core Performance Improvements

## Key Optimizations Implemented
1. **Lean home dashboard data**: `/` now calls `imageApi.search` with `limit=60` and sorting metadata instead of fetching the entire catalog, reducing the initial payload (`src/app/page.tsx`).
2. **Image virtualization-friendly layouts**:
   - Admin queue, review workflow, and user tables now use `next/image` with native lazy loading to optimize thumbnails (`src/components/CurationQueue.tsx`, `ReviewWorkflow.tsx`, `UserManagement.tsx`).
   - Gallery page uses client-side pagination (24 cards per page) to avoid rendering hundreds of cards at once (`src/app/images/page.tsx`).
3. **Search pagination**: `/search` adds API-backed pagination (page + limit) with summary + controls so we only pull 24 results per request and keep the DOM light (`src/app/search/page.tsx`).
4. **Map already lazily loaded**: the `map` route and the search map view continue to use `next/dynamic(..., { ssr: false })` to defer the Leaflet bundle until needed.

## Implementation Cheatsheet

### Use `next/image` for backend thumbnails
```tsx
import Image from 'next/image';

<div className="relative h-16 w-16">
  <Image
    src={thumbnailUrl || '/placeholder-image.svg'}
    alt={title ?? 'Submission thumbnail'}
    fill
    sizes="64px"
    className="rounded-lg object-cover"
    unoptimized   // when serving from our API domain
  />
</div>
```
- Provide fixed dimensions (`width`/`height` or `fill`) so Next can reserve layout space.
- Use `unoptimized` or add the CDN/API host to `next.config.js` → `images.domains`.

### Lazy-load heavy visualizations
```tsx
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), {
  ssr: false,
  loading: () => <Spinner label="Loading map…" />,
});
```
- Keep Leaflet code and map tiles out of the initial bundle.
- Pair with `next/dynamic` for charts, 3D viewers, etc.

### Client-side pagination / infinite scroll
```tsx
const RESULTS_PER_PAGE = 24;
const [currentPage, setCurrentPage] = useState(1);

const { data } = useQuery({
  queryKey: ['search', filters, currentPage],
  queryFn: () => imageApi.search({ ...filters, page: currentPage, limit: RESULTS_PER_PAGE }),
});

const totalPages = data?.total_pages ?? 1;
```
- Always reset to page 1 when filters/search query change.
- Show “Showing X–Y of Z” + Prev/Next buttons.
- For infinite scroll, watch the last card with `IntersectionObserver` and increment `page`.

### React performance techniques
1. **Memoize derived data** – e.g., `useMemo(() => searchResults?.images ?? [], [searchResults])`.
2. **Stable callbacks** – wrap filter toggles in `useCallback` so child components don’t re-render unnecessarily.
3. **Component splitting** – separate heavy map/panel components so filter state updates don’t rerender them.
4. **Suspense-friendly loading states** – keep skeletons localized; don’t block the entire page for a single query.

## Lighthouse / Web Vitals Checklist
| Item | How to verify | Fixes |
| --- | --- | --- |
| **Largest Contentful Paint** < 2.5s | Lighthouse → Performance tab | Use optimized images, defer hero content, leverage Next Image. |
| **Total Blocking Time** < 200 ms | Lighthouse diagnostics | Remove unused libraries, split bundles with dynamic imports, memoize expensive calculations. |
| **CLS** < 0.1 | Layout shifts report | Reserve image sizes, avoid injecting banners above the fold without space. |
| **Network payload** | Lighthouse → “Reduce unused JavaScript” | Trim bundle (dynamic imports), ensure API calls use pagination/limits. |
| **Caching** | Lighthouse “Serve static assets efficiently” | Use Next/PWA caching, set `staleTime` for frequently re-used React Query data. |
| **Third-party scripts** | Lighthouse warnings | Lazy-load analytics/maps; disable SSR for heavy widgets. |

### Recommended Workflow
1. `npm run dev` + `npx @lhci/cli autorun --config=./lighthouserc.json`.
2. Fix the top offenders (JS execution time, image sizes, layout shifts).
3. Re-run until **Performance ≥ 80** across `/`, `/search`, and `/map`.

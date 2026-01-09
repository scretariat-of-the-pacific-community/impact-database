# Epic 2.1 – Design System & Components

## Overview
We now have a baseline design system tailored to the seriousness of a disaster-management portal. The goal was to remove one-off Tailwind snippets and ship composable components + tokens that can be exercised in Storybook.

## Deliverables
1. **Design tokens via Tailwind** – `tailwind.config.ts` defines brand/ocean/danger palettes, surface colors, shadows, and typography so every component can reference the same visual language.
2. **Design-system primitives** – Added `Button`, `Card`, `Tag`, and `FormField` components under `src/components/design-system/` with Storybook stories for visual review.
3. **Adoption examples**
   - Homepage stats/navigation cards now reuse `<Card>` and `<Tag>` for consistent spacing and states.
   - Upload form uses `<FormField>` and the new `<Button>` for accessible, uniform inputs.
   - Filter chips (search and gallery) rely on `<Tag>` for a11y-friendly removable pills.
4. **Storybook setup** – `.storybook/` config + stories for the new primitives allow running `npm run storybook` for visual QA and documentation.

## Usage Cheatsheet
```tsx
import { Button, Card, Tag, FormField } from '@/components/design-system';

<Card heading="Pending Reviews" eyebrow="Curation Queue" actions={<Button size="sm">View</Button>}>
  <p className="text-sm text-slate-600">6 submissions waiting for triage.</p>
</Card>

<Tag tone="danger" onRemove={() => toggle('earthquake')}>Earthquake</Tag>

<FormField label="Location" htmlFor="location" required error={errors.location?.message}>
  <input id="location" className="input" {...register('location')} />
</FormField>

<Button variant="primary" leftIcon={<UploadIcon />} isLoading={isSubmitting}>
  Upload Image
</Button>
```

## Tailwind Tokens
- `brand`, `ocean`, `danger`, `success`, `warning` palettes for CTA/alert consistency.
- `surface` colors for cards (`bg-surface`, `bg-surface-muted`) and `shadow-card` / `shadow-card-hover`.
- `fontFamily.sans = 'Inter'` plus larger radius (`rounded-2xl`) to match modern emergency dashboards.

## Storybook Commands
```bash
cd frontend
npm run storybook          # dev UI
npm run build-storybook    # static docs
```

## Next Steps
- Expand tokens with spacing/typography aliases (e.g., `--ds-spacing-` scale).
- Add stories for higher-level patterns (filter panels, metadata forms) and wire Percy/visual tests.
- Audit legacy views to swap bespoke markup for these primitives to improve cohesion and velocity.

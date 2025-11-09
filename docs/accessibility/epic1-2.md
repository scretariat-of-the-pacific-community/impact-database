# Epic 1.2 – Accessibility & Keyboard Navigation

## Goals
- Approach WCAG 2.1 AA for core flows (login, upload, search/map, admin curation).
- Ensure predictable focus order, visible focus indicators, and accurate ARIA landmarks.
- Document a repeatable checklist plus example implementations developers can copy.

## Key Improvements Implemented
1. **Skip link + main landmark** – `app/layout.tsx` now includes a “Skip to main content” link and wraps page content in `<main id="main-content" role="main">` for screen-reader navigation.
2. **Consistent focus styles** – `globals.css` defines focus-visible outlines and styles the skip link (also adds `prefers-reduced-motion` safeguards).
3. **Keyboardable cards and buttons** – `Button.tsx` exposes an accessible, focus-ring-aware button; `ImageThumbnail` became a real `<button>`; curation queue rows now respond to Enter/Space and expose ARIA labels.
4. **Modal accessibility** – Quick-view modal traps focus, advertises `role="dialog" aria-modal="true"`, restores focus on close, and honor Escape.
5. **Landmarks and labels** – Navigation bars (`/curation`, Review workflow tabs, image detail tabs) advertise `role="navigation"` + `aria-label`, and icon-only buttons received `aria-label`s.

## ARIA & Landmark Guidance
- **Top-level landmarks**: Always expose `<header role="banner">`, `<nav role="navigation" aria-label="Primary">`, `<main id="main-content" role="main">`, and `<footer role="contentinfo">` on complex pages.
- **Sidebars**: Use `<aside role="complementary" aria-label="Filters">` when the sidebar supplements the main content.
- **Maps**: Wrap Leaflet/TMS maps in `<section role="region" aria-label="Map of recent impacts">` and provide textual summaries for screen-readers (counts, last-updated).

## Example Snippets

### Skip link + layout skeleton
```tsx
// app/layout.tsx
<body>
  <a href="#main-content" className="skip-link">Skip to main content</a>
  <Header />
  <main id="main-content" role="main" tabIndex={-1}>
    {children}
  </main>
</body>
```

### Keyboard-accessible custom button & sidebar item
```tsx
// components/Button.tsx
<Button variant="secondary" aria-pressed={isActive} onClick={toggle}>
  Toggle filters
</Button>

// Sidebar item implemented as a focusable div
<div
  role="button"
  tabIndex={0}
  aria-current={activeSection === section.id}
  aria-label={`Open ${section.label} panel`}
  onClick={() => setActiveSection(section.id)}
  onKeyDown={(event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setActiveSection(section.id);
    }
  }}
>
  {section.label}
</div>
```

### Accessible modal (focus trap + Escape)
```tsx
const dialogRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!isOpen) return;
  const previous = document.activeElement as HTMLElement | null;
  const focusable = () =>
    dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);

  const handleKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'Tab') {
      const nodes = focusable();
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    }
  };

  document.addEventListener('keydown', handleKey);
  focusable()?.[0]?.focus();
  return () => {
    document.removeEventListener('keydown', handleKey);
    previous?.focus();
  };
}, [isOpen, onClose]);

return (
  <div role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={dialogRef}>
    ...
  </div>
);
```

## Page-level WCAG 2.1 AA Checklist
1. **Landmarks & headings**
   - Exactly one `<h1>` per view.
   - Landmark roles/labels present (`banner`, `navigation`, `main`, `complementary`, `contentinfo`).
2. **Keyboard navigation**
   - Every interactive element reachable via Tab in logical order.
   - Custom controls implement Enter/Space activation.
   - Focus never trapped unless intentionally (modals) and always restored.
3. **Visible focus**
   - `:focus-visible` outlines meet 3:1 contrast and are not removed by Tailwind overrides.
4. **ARIA accuracy**
   - Use ARIA only when native elements cannot express semantics.
   - Icon-only buttons expose `aria-label` or `aria-labelledby`.
   - `aria-expanded`, `aria-pressed`, `aria-current`, etc., stay in sync with real state.
5. **Color & contrast**
   - Text/background combinations keep ≥4.5:1 ratio (3:1 for large text).
   - Focus rings and error states also meet contrast guidelines.
6. **Motion & announcements**
   - Honor `prefers-reduced-motion`.
   - Use `aria-live="polite"` for toasts or async status changes that need narration.
7. **Media & alt text**
   - All images include descriptive `alt`.
   - Video/audio provide captions or transcripts.

## Automated Checks
Run these locally before shipping:
1. **axe DevTools** (browser extension or CLI):
   ```bash
   # With Playwright (headless)
   npx @axe-core/playwright http://localhost:3000/upload
   ```
2. **Lighthouse**:
   - `npx @lhci/cli autorun --collect.url=http://localhost:3000/search --collect.startServerCommand="npm run dev"` (add relevant URLs).
3. **Playwright smoke tests**:
   ```bash
   cd frontend
   npm run test:e2e            # ensures keyboard flows keep working
   ```

Review the reported issues, prioritize “critical/serious” from axe and “Accessibility < 90” from Lighthouse, and file tickets for anything we can’t fix immediately.

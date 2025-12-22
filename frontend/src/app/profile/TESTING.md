# Profile Page Testing Guide

## E2E Testing with data-testid

The profile page tabs are now fully instrumented for end-to-end testing with Playwright, Cypress, or similar frameworks.

### Available Test IDs

#### Tab Buttons
- `profile-tab-uploads` - Uploads tab button
- `profile-tab-activity` - Activity tab button
- `profile-tab-achievements` - Achievements tab button
- `profile-tab-analytics` - Analytics tab button
- `profile-tab-collaboration` - Collaboration tab button
- `profile-tab-settings` - Settings tab button

#### Tab Panels
- `profile-panel-uploads` - Uploads content panel
- `profile-panel-activity` - Activity content panel
- `profile-panel-achievements` - Achievements content panel
- `profile-panel-analytics` - Analytics content panel
- `profile-panel-collaboration` - Collaboration content panel
- `profile-panel-settings` - Settings content panel

#### Active Indicator
- `active-tab-indicator` - The animated gradient underline on the active tab

### Example Test Cases

#### Playwright Example

```typescript
import { test, expect } from '@playwright/test';

test('should navigate between tabs', async ({ page }) => {
  await page.goto('/profile');
  
  // Click settings tab
  await page.getByTestId('profile-tab-settings').click();
  
  // Verify panel is visible
  await expect(page.getByTestId('profile-panel-settings')).toBeVisible();
  
  // Verify active indicator is present
  await expect(page.getByTestId('active-tab-indicator')).toBeVisible();
});

test('should navigate tabs with keyboard', async ({ page }) => {
  await page.goto('/profile');
  
  // Focus first tab
  await page.getByTestId('profile-tab-uploads').focus();
  
  // Press arrow right to move to next tab
  await page.keyboard.press('ArrowRight');
  
  // Verify activity tab is now focused
  await expect(page.getByTestId('profile-tab-activity')).toBeFocused();
});

test('should fade between tab content', async ({ page }) => {
  await page.goto('/profile');
  
  const panel = page.getByTestId('profile-panel-uploads');
  
  // Click another tab
  await page.getByTestId('profile-tab-analytics').click();
  
  // Wait for fade animation (200ms)
  await page.waitForTimeout(200);
  
  // Verify new content is loaded
  await expect(page.getByTestId('profile-panel-analytics')).toBeVisible();
});
```

#### Cypress Example

```typescript
describe('Profile Tabs', () => {
  beforeEach(() => {
    cy.visit('/profile');
  });

  it('should switch tabs on click', () => {
    cy.get('[data-testid="profile-tab-collaboration"]').click();
    cy.get('[data-testid="profile-panel-collaboration"]').should('be.visible');
    cy.get('[data-testid="active-tab-indicator"]').should('exist');
  });

  it('should navigate with keyboard arrows', () => {
    cy.get('[data-testid="profile-tab-uploads"]').focus();
    cy.get('[data-testid="profile-tab-uploads"]').type('{rightarrow}');
    cy.get('[data-testid="profile-tab-activity"]').should('have.focus');
  });

  it('should jump to first tab with Home key', () => {
    cy.get('[data-testid="profile-tab-settings"]').focus();
    cy.get('[data-testid="profile-tab-settings"]').type('{home}');
    cy.get('[data-testid="profile-tab-uploads"]').should('have.focus');
  });
});
```

## Accessibility Testing

### ARIA Attributes
All tabs have proper ARIA attributes for screen reader support:
- `role="tab"` on buttons
- `role="tablist"` on container
- `role="tabpanel"` on content areas
- `aria-selected` indicates active tab
- `aria-controls` links tabs to panels
- `aria-labelledby` links panels to tabs

### Keyboard Navigation
- **Arrow Left/Right**: Navigate between tabs
- **Home**: Jump to first tab
- **End**: Jump to last tab
- **Tab**: Move focus to panel content

### Focus Management
- Visible focus ring (WCAG 2.4.7 compliant)
- Focus moves to newly selected tab after arrow navigation
- Tab panel is focusable for keyboard users

## Animation Testing

The profile tabs include a fade transition between content:
- **Fade out duration**: 150ms
- **Fade in duration**: 50ms
- **Total transition**: ~200ms

Tests should account for this timing when checking for content changes.

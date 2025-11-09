import { test, expect, Page, Route } from '@playwright/test';
import { Buffer } from 'node:buffer';

type UserRole = 'viewer' | 'contributor' | 'editor' | 'admin';

const respondJson = (route: Route, data: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(data),
  });

const buildSession = (roles: UserRole[]) => ({
  user: {
    id: 'playwright-user',
    email: 'citizen.scientist@example.com',
    name: 'Playwright User',
    roles,
    organization: 'QA',
    country: 'PW',
    created_at: new Date().toISOString(),
    last_login: new Date().toISOString(),
  },
  access_token: 'playwright-access-token',
  refresh_token: 'playwright-refresh-token',
  expires_at: Date.now() + 60 * 60 * 1000,
});

const enableSession = async (page: Page, roles: UserRole[] = ['viewer']) => {
  const session = buildSession(roles);
  await page.addInitScript((sessionData) => {
    localStorage.setItem('ocean_portal_session', JSON.stringify(sessionData));
    localStorage.setItem('authToken', sessionData.access_token);
    localStorage.setItem('token', sessionData.access_token);
  }, session);
};

const vocabulariesResponse = {
  hazard_types: [
    { id: 'flood', label: 'Flood', description: 'Flooding events' },
    { id: 'cyclone', label: 'Cyclone', description: 'Cyclone events' },
  ],
  countries: [
    { id: 'fj', label: 'Fiji' },
    { id: 'vu', label: 'Vanuatu' },
  ],
};

const mockQueueItem = {
  id: 'cur-1',
  imageId: 'IMG-001',
  title: 'Flooded Coastal Road',
  description: 'Standing water blocking access',
  status: 'pending',
  priority: 'high',
  assignedTo: null,
  flagged: false,
  submittedBy: 'field.agent@example.com',
  submittedAt: '2024-01-15T12:00:00Z',
  lastModified: '2024-01-15T12:00:00Z',
  commentsCount: 0,
  metadata: {
    hazardType: 'flood',
    captureDate: '2024-01-10',
  },
};

const mockReviewItem = {
  ...mockQueueItem,
  location: {
    latitude: -17.7,
    longitude: 168.3,
    address: 'Port Vila, Vanuatu',
  },
  reviewerNotes: '',
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
});

test.describe('Core citizen-science flows (Playwright smoke suite)', () => {
  test('Login page shows guest fallback and redirects authenticated visitors', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign In with SPC SSO/i })).toBeVisible();

    const guestNavigation = page.waitForURL('**/');
    await page.getByRole('button', { name: /Continue as Guest/i }).click();
    await guestNavigation;

    await page.goto('/auth/login');
    await page.evaluate((sessionData) => {
      localStorage.setItem('ocean_portal_session', JSON.stringify(sessionData));
      localStorage.setItem('authToken', sessionData.access_token);
      localStorage.setItem('token', sessionData.access_token);
    }, buildSession(['viewer']));
    await page.reload();
    await expect(page).toHaveURL(/\/$/);
  });

  test('Contributors can upload imagery with metadata and see the success state', async ({ page }) => {
    await page.route('**/api/vocabularies', (route) => respondJson(route, vocabulariesResponse));
    await page.route('**/upload/upload', async (route) => {
      respondJson(route, { id: 'img-playwright', status: 'received' });
    });
    await enableSession(page, ['contributor']);

    await page.goto('/upload');
    await expect(page.getByRole('heading', { name: 'Upload Image' })).toBeVisible();

    const filePayload = {
      name: 'impact.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('playwright-image'),
    };
    await page.setInputFiles('#file-upload', filePayload);
    await page.selectOption('select[name="hazard_type"]', 'flood');
    await page.fill('input[name="location"]', 'Port Vila, Vanuatu');

    await page.getByRole('button', { name: /Upload Image/i }).click();
    await expect(page.getByText(/Upload completed successfully/i)).toBeVisible();
  });

  test('Admins can open the curation queue and approve a submission', async ({ page }) => {
    await enableSession(page, ['admin']);

    await page.route('**/api/admin/dashboard**', (route) =>
      respondJson(route, {
        stats: {
          submissions_last_7d: 12,
          approvals_last_7d: 8,
          pending: 4,
        },
      })
    );

    await page.route('**/api/admin/curation/queue?**', (route) =>
      respondJson(route, { items: [mockQueueItem], total: 1 })
    );

    await page.route('**/api/admin/curation/queue/cur-1', (route) => {
      if (route.request().method() === 'PUT') {
        respondJson(route, { ...mockReviewItem, status: 'approved' });
        return;
      }
      respondJson(route, mockReviewItem);
    });

    await page.goto('/curation');
    await page.getByRole('button', { name: 'Curation Queue' }).click();

    await expect(page.getByText('Flooded Coastal Road')).toBeVisible();
    await page.getByText('Flooded Coastal Road').click();
    await expect(page.getByRole('heading', { name: 'Review Item' })).toBeVisible();

    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('APPROVED')).toBeVisible();
  });

  test('Search map view reflects hazard filters on the marker layer', async ({ page }) => {
    const allImages = [
      {
        id: 'img-1',
        title: 'Flood marker',
        hazard_type: 'flood',
        latitude: -17.75,
        longitude: 168.32,
        upload_date: new Date().toISOString(),
      },
      {
        id: 'img-2',
        title: 'Cyclone marker',
        hazard_type: 'cyclone',
        latitude: -18.1,
        longitude: 167.9,
        upload_date: new Date().toISOString(),
      },
    ];
    const floodOnly = [allImages[0]];

    await page.route('**/api/v1/images/search**', (route) => {
      const url = new URL(route.request().url());
      const hazards = url.searchParams.getAll('hazard_type');
      const payload = hazards.includes('flood')
        ? { images: floodOnly, total: floodOnly.length }
        : { images: allImages, total: allImages.length };
      respondJson(route, payload);
    });

    await page.goto('/search');
    await page.getByRole('button', { name: 'Filters' }).click();
    await page.getByLabel('Flood').check();
    await page.getByRole('button', { name: 'Map view' }).click();

    const markers = page.locator('.leaflet-marker-icon');
    await expect(markers).toHaveCount(1);

    await markers.first().click();
    await expect(page.getByRole('link', { name: /Flood marker/i })).toBeVisible();
  });
});

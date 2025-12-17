import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  });

const renderTimeline = async (module?: typeof import('@/components/profile/ActivityTimeline')) => {
  const activityModule = module ?? (await import('@/components/profile/ActivityTimeline'));
  const queryClient = createQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <activityModule.default />
    </QueryClientProvider>,
  );
};

describe('ActivityTimeline', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders activities with semantic list roles', async () => {
    await renderTimeline();

    expect(await screen.findByRole('feed', { name: /activity feed/i })).toBeInTheDocument();
    const items = await screen.findAllByRole('listitem');
    expect(items.length).toBeGreaterThan(0);
  });

  it('filters activities by type', async () => {
    await renderTimeline();

    await userEvent.click(screen.getByRole('button', { name: /filter by uploads/i }));

    await waitFor(() => {
      const items = screen.getAllByRole('listitem');
      expect(items.length).toBeGreaterThan(0);
      items.forEach((item) => {
        expect(item.textContent?.toLowerCase()).toContain('upload');
      });
    });
  });

  it('marks individual activities as read and updates counters', async () => {
    await renderTimeline();

    const unreadFlags = await screen.findAllByText('Unread');
    const initialUnread = unreadFlags.length;

    const markButtons = await screen.findAllByRole('button', { name: /mark .* as read/i });
    await userEvent.click(markButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/marked as read/i)).toBeInTheDocument();
      const remainingUnread = screen.getAllByText('Unread').length;
      expect(remainingUnread).toBe(initialUnread - 1);
      expect(screen.getByRole('button', { name: /mark all as read/i })).not.toBeDisabled();
    });
  });

  it('disables bulk read when all items are read', async () => {
    await renderTimeline();

    const bulkButton = await screen.findByRole('button', { name: /mark all as read/i });
    expect(bulkButton).toBeEnabled();

    await userEvent.click(bulkButton);

    await waitFor(() => {
      expect(screen.queryByText('Unread')).not.toBeInTheDocument();
      expect(bulkButton).toBeDisabled();
    });
  });

  it('shows error state when query fails', async () => {
    const module = await import('@/components/profile/ActivityTimeline');
    vi.spyOn(module, 'fetchActivityTimeline').mockRejectedValueOnce(new Error('Network error'));

    await renderTimeline(module);

    expect(await screen.findByText(/failed to load activity timeline/i)).toBeInTheDocument();
  });

  it('shows loading and empty states appropriately', async () => {
    const module = await import('@/components/profile/ActivityTimeline');
    vi.spyOn(module, 'fetchActivityTimeline').mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve([]), 50)),
    );

    await renderTimeline(module);

    expect(await screen.findByText(/loading timeline/i)).toBeInTheDocument();
    expect(await screen.findByText(/no activity to show/i)).toBeInTheDocument();
  });

  it('renders review, system, and achievement details', async () => {
    await renderTimeline();

    expect(await screen.findByText(/reviewed by/i)).toBeInTheDocument();
    expect(screen.getByText(/feedback from/i)).toBeInTheDocument();
    expect(screen.getByText(/scheduled maintenance/i)).toBeInTheDocument();

    const achievementHeading = screen.getByRole('heading', { name: /consistency champion/i });
    expect(achievementHeading).toBeInTheDocument();
    const achievementBadge = within(achievementHeading.closest('article') as HTMLElement).getByText(/consistency champion/i);
    expect(achievementBadge).toHaveClass('rounded-full');
  });
});

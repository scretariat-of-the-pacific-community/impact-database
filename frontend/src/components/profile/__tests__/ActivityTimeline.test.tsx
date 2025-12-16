import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import ActivityTimeline from '@/components/profile/ActivityTimeline';

const renderTimeline = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityTimeline />
    </QueryClientProvider>,
  );
};

describe('ActivityTimeline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders activities with semantic list roles', async () => {
    renderTimeline();

    expect(await screen.findByRole('feed', { name: /activity feed/i })).toBeInTheDocument();
    const items = await screen.findAllByRole('listitem');
    expect(items.length).toBeGreaterThan(0);
  });

  it('filters activities by type', async () => {
    renderTimeline();

    await userEvent.click(screen.getByRole('button', { name: /filter by uploads/i }));

    await waitFor(() => {
      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(1);
      expect(screen.getByText(/uploaded/i)).toBeInTheDocument();
    });
  });

  it('marks individual activities as read and updates counters', async () => {
    renderTimeline();

    const unreadBadge = await screen.findByText('Unread');
    expect(unreadBadge).toBeInTheDocument();

    const markButtons = await screen.findAllByRole('button', { name: /mark as read/i });
    await userEvent.click(markButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/marked as read/i)).toBeInTheDocument();
      expect(screen.getByText(/Mark all as read/)).not.toBeDisabled();
    });
  });

  it('disables bulk read when all items are read', async () => {
    renderTimeline();

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

    renderTimeline();

    expect(await screen.findByText(/failed to load activity timeline/i)).toBeInTheDocument();
  });
});

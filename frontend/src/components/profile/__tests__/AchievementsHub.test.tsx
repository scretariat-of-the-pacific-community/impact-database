import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import AchievementsHub from '@/components/profile/AchievementsHub';

describe('AchievementsHub', () => {
  let originalShare: Navigator['share'];
  let originalOpen: Window['open'];

  beforeEach(() => {
    originalShare = navigator.share;
    originalOpen = window.open;
  });

  afterEach(() => {
    navigator.share = originalShare;
    window.open = originalOpen;
    vi.restoreAllMocks();
  });

  it('renders share buttons with accessible labels', () => {
    render(<AchievementsHub />);

    expect(screen.getByLabelText(/share regional explorer/i)).toBeInTheDocument();
  });

  it('never shows negative remaining counts', () => {
    render(<AchievementsHub />);

    expect(screen.getByText(/next: 0 remaining/i)).toBeInTheDocument();
  });

  it('exposes progress bars with correct aria metadata', () => {
    render(<AchievementsHub />);

    const progress = screen.getByRole('progressbar', { name: /regional explorer progress/i });
    expect(progress).toHaveAttribute('aria-valuemin', '0');
    expect(progress).toHaveAttribute('aria-valuemax', '100');
    expect(progress).toHaveAttribute('aria-valuenow', '100');
  });

  it('highlights the current user in the leaderboard', () => {
    render(<AchievementsHub />);

    expect(screen.getByText('You').closest('div')).toHaveClass('bg-pacific-500/10');
  });

  it('falls back to window.open sharing when navigator.share is unavailable', () => {
    // @ts-expect-error allow overriding for test
    navigator.share = undefined;
    window.open = vi.fn();

    render(<AchievementsHub />);

    screen.getByLabelText(/share regional explorer/i).click();

    return waitFor(() => expect(window.open).toHaveBeenCalled());
  });

  it('uses navigator.share when available', async () => {
    navigator.share = vi.fn().mockResolvedValue(undefined);
    window.open = vi.fn();

    render(<AchievementsHub />);
    screen.getByLabelText(/share regional explorer/i).click();

    await waitFor(() =>
      expect(navigator.share).toHaveBeenCalledWith({
        title: 'Impact Database Achievement',
        text: 'I unlocked the Regional Explorer badge on the Impact Database!',
        url: 'https://impactdatabase.org',
      }),
    );
    expect(window.open).not.toHaveBeenCalled();
  });

  it('logs share errors when navigator.share rejects', async () => {
    navigator.share = vi.fn().mockRejectedValue(new Error('fail'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<AchievementsHub />);
    screen.getByLabelText(/share regional explorer/i).click();

    await waitFor(() => expect(consoleSpy).toHaveBeenCalled());
    expect(consoleSpy.mock.calls[0]?.[0]).toContain('Regional Explorer');
  });

  it('renders the notification timeline items', () => {
    render(<AchievementsHub />);

    expect(screen.getByText(/unlocked: regional explorer/i)).toBeInTheDocument();
    expect(screen.getByText(/leaderboard surge/i)).toBeInTheDocument();
    expect(screen.getByText(/quality streak at 90%/i)).toBeInTheDocument();
  });
});

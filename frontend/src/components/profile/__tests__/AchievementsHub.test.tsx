import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import AchievementsHub from '@/components/profile/AchievementsHub';

describe('AchievementsHub', () => {
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
    const originalShare = navigator.share;
    const originalOpen = window.open;
    // @ts-expect-error allow overriding for test
    navigator.share = undefined;
    window.open = vi.fn();

    render(<AchievementsHub />);

    screen.getByLabelText(/share regional explorer/i).click();

    expect(window.open).toHaveBeenCalled();
    navigator.share = originalShare;
    window.open = originalOpen;
  });
});

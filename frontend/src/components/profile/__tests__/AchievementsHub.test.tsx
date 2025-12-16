import { render, screen, waitFor, within } from '@testing-library/react';
import { Globe2, Upload } from 'lucide-react';
import { vi } from 'vitest';
import AchievementsHub from '@/components/profile/AchievementsHub';

describe('AchievementsHub', () => {
  let originalShare: Navigator['share'] | undefined;
  let originalOpen: Window['open'] | undefined;

  beforeEach(() => {
    originalShare = 'share' in navigator ? navigator.share : undefined;
    originalOpen = 'open' in window ? window.open : undefined;
  });

  afterEach(() => {
    if ('share' in navigator) {
      navigator.share = originalShare;
    }
    if ('open' in window) {
      window.open = originalOpen;
    }
    vi.restoreAllMocks();
  });

  it('renders share buttons for all unlocked achievements with accessible labels', () => {
    render(<AchievementsHub />);

    const shareButtons = screen.getAllByLabelText(/share .*achievement|share .*explorer/i);
    expect(shareButtons.length).toBeGreaterThanOrEqual(2);
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

  it('renders the notification timeline items in order with timestamps', () => {
    render(<AchievementsHub />);

    const timeline = screen.getByLabelText(/achievement timeline/i);
    const items = within(timeline).getAllByRole('listitem');

    expect(items[0]).toHaveTextContent(/unlocked: regional explorer/i);
    expect(items[0]).toHaveTextContent(/today, 09:45/i);
    expect(items[1]).toHaveTextContent(/leaderboard surge/i);
    expect(items[1]).toHaveTextContent(/yesterday, 16:20/i);
    expect(items[2]).toHaveTextContent(/quality streak at 90%/i);
    expect(items[2]).toHaveTextContent(/mon, 14:10/i);
  });

  it('caps progress at 100% and applies category styling to achievements', () => {
    const customAchievements = [
      {
        id: 'overachiever',
        name: 'Overachiever',
        category: 'Explorer' as const,
        description: 'Exceeded progress example',
        icon: Globe2,
        progress: 120,
        target: 100,
        milestoneLabel: 'Countries mapped',
        unlocked: true,
        nextMilestone: 'Maxed out',
      },
    ];

    render(
      <AchievementsHub
        achievementsData={customAchievements}
        leaderboardData={[]}
        notificationsData={[]}
      />,
    );

    expect(screen.getByText(/Unlocked/i)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /overachiever progress/i })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
    expect(screen.getByLabelText(/overachiever achievement card/i).className).toContain('from-sand-500/20');
  });

  it('only renders share buttons for unlocked achievements', () => {
    const achievements = [
      {
        id: 'share-ready',
        name: 'Share Ready',
        category: 'Contributor' as const,
        description: 'Unlocked badge to share',
        icon: Upload,
        progress: 10,
        target: 10,
        milestoneLabel: 'Uploads',
        unlocked: true,
        nextMilestone: 'Completed',
      },
      {
        id: 'locked',
        name: 'Locked Badge',
        category: 'Explorer' as const,
        description: 'Still in progress',
        icon: Globe2,
        progress: 2,
        target: 5,
        milestoneLabel: 'Countries mapped',
        unlocked: false,
        nextMilestone: '3 more needed',
      },
    ];

    render(
      <AchievementsHub
        achievementsData={achievements}
        leaderboardData={[]}
        notificationsData={[]}
      />,
    );

    expect(screen.getAllByLabelText(/share/i)).toHaveLength(1);
    expect(screen.queryByLabelText(/share locked badge/i)).not.toBeInTheDocument();
  });
});

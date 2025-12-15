import { render, screen } from '@testing-library/react';
import AchievementsHub from '@/components/profile/AchievementsHub';

describe('AchievementsHub', () => {
  it('renders share buttons with accessible labels', () => {
    render(<AchievementsHub />);

    expect(screen.getByLabelText(/share regional explorer achievement/i)).toBeInTheDocument();
  });

  it('never shows negative remaining counts', () => {
    render(<AchievementsHub />);

    expect(screen.getByText(/next: 0 remaining/i)).toBeInTheDocument();
  });
});

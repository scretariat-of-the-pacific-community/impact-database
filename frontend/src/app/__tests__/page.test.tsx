import { render, screen } from '@testing-library/react';
import HomePage from '@/app/page';

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [], isLoading: false, error: null }),
}));

jest.mock('@/lib/api', () => ({
  imageApi: { getAll: jest.fn() },
}));

describe('Home page', () => {
  it('renders portal heading', () => {
    render(<HomePage />);
    expect(screen.getByText(/SPC Ocean Portal/i)).toBeInTheDocument();
  });
});


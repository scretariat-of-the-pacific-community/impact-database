import { render, screen } from '@testing-library/react';
import HomePage from '@/app/page';

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { images: [] }, isLoading: false, error: null }),
}));

jest.mock('@/lib/api', () => ({
  imageApi: { search: jest.fn() },
}));

describe('Home page', () => {
  it('renders portal heading', () => {
    render(<HomePage />);
    expect(screen.getByText(/SPC Ocean Portal/i)).toBeInTheDocument();
  });
});

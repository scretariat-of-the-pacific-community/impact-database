import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import IndexPage from './index';

const mockData = {
  title: 'Image One',
  hazard_type: 'Fire',
  coordinates: [3, 4],
};

test('clicking image loads metadata preview', async () => {
  (global as any).fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => mockData,
  });

  render(<IndexPage />);
  fireEvent.click(screen.getByText('image1.jpg'));

  expect(fetch).toHaveBeenCalledWith('/api/images/image1.jpg', expect.any(Object));
  await waitFor(() => screen.getByText('Image One'));
  expect(screen.getByText('Hazard: Fire')).toBeInTheDocument();
});

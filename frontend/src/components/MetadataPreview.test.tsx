import { render, screen, waitFor } from '@testing-library/react';
import MetadataPreview from './MetadataPreview';

const mockData = {
  title: 'Sample Image',
  hazard_type: 'Flood',
  coordinates: [1, 2],
};

test('fetches and displays metadata', async () => {
  (global as any).fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => mockData,
  });

  render(<MetadataPreview filename="sample.jpg" />);

  expect(fetch).toHaveBeenCalledWith('/api/images/sample.jpg');
  await waitFor(() => screen.getByText('Sample Image'));
  expect(screen.getByText('Hazard: Flood')).toBeInTheDocument();
  expect(screen.getByText('Coordinates: 1, 2')).toBeInTheDocument();
});

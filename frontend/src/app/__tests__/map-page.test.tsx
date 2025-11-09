import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MapPage from '@/app/map/page';
import { imageApi } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  imageApi: {
    search: jest.fn(),
  },
}));

jest.mock('@/lib/leaflet-config', () => ({
  configureLeafletIcons: jest.fn(),
}));

jest.mock('@/lib/mapUtils', () => ({
  createCustomIcon: jest.fn(() => ({})),
}));

jest.mock('next/dynamic', () => {
  const componentNames = ['mapcontainer', 'tilelayer', 'marker', 'popup'];
  let callIndex = 0;
  return () => {
    const name = componentNames[callIndex] || `dynamic-${callIndex}`;
    callIndex += 1;
    const DynamicComponent = ({ children }: { children?: any }) => (
      <div data-testid={`dynamic-${name}`}>{children}</div>
    );
    return DynamicComponent;
  };
});

const mockImageApi = imageApi as jest.Mocked<typeof imageApi>;

const renderWithClient = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MapPage />
    </QueryClientProvider>
  );
};

describe('MapPage citizen-science flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders markers for geocoded impacts', async () => {
    mockImageApi.search.mockResolvedValue({
      images: [
        { id: 'img-1', title: 'Flooded Village', filename: 'village.jpg', latitude: 10, longitude: 20, hazard_type: 'flood' },
        { id: 'img-2', title: 'Cyclone Damage', filename: 'damage.jpg', latitude: -5, longitude: 140, hazard_type: 'cyclone' },
        { id: 'img-3', title: 'No Location', filename: 'noloc.jpg', hazard_type: 'flood' },
      ],
    });

    renderWithClient();

    expect(await screen.findByTestId('dynamic-mapcontainer')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Flooded Village/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cyclone Damage/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /No Location/i })).not.toBeInTheDocument();
  });

  it('shows error state and retries when the API fails', async () => {
    mockImageApi.search
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce({ images: [] });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    renderWithClient();

    expect(await screen.findByText(/Error loading map data/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Retry loading/i }));
    await waitFor(() => {
      expect(mockImageApi.search).toHaveBeenCalledTimes(2);
    });

    (console.error as jest.Mock).mockRestore();
  });
});

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReviewWorkflow from '@/components/ReviewWorkflow';

const mockItem = {
  id: 'cur-1',
  imageId: 'IMG-001',
  title: 'Coastal Flooding',
  description: 'Severe flooding event',
  status: 'pending',
  priority: 'high',
  assignedTo: null,
  submittedBy: 'citizen.scientist@example.com',
  submittedAt: '2024-01-01T00:00:00Z',
  lastModified: '2024-01-01T00:00:00Z',
  flagged: false,
  commentsCount: 0,
  metadata: {
    hazardType: 'flood',
    captureDate: '2024-01-01',
  },
};

const renderWorkflow = (props: Partial<React.ComponentProps<typeof ReviewWorkflow>> = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ReviewWorkflow itemId="cur-1" {...props} />
    </QueryClientProvider>
  );
};

describe('ReviewWorkflow citizen-science flow', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    (global.fetch as jest.Mock).mockReset();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('renders review data and approves a submission', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockItem,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'approved' }),
      });

    const onStatusChange = jest.fn();
    renderWorkflow({ onStatusChange });

    expect(await screen.findByText(/Review Item/i)).toBeInTheDocument();
    expect(screen.getByText(/Coastal Flooding/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Approve/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith(
        '/api/admin/curation/queue/cur-1',
        expect.objectContaining({ method: 'PUT' })
      );
    });
    expect(onStatusChange).toHaveBeenCalledWith('approved');
  });

  it('shows an error banner when the review item fails to load', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Server error',
    });

    renderWorkflow();

    expect(await screen.findByText(/Error loading review item/i)).toBeInTheDocument();
    expect(screen.getByText(/Failed to fetch review item/i)).toBeInTheDocument();
  });
});

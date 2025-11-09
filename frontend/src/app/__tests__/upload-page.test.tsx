import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import UploadPage from '@/app/upload/page';
import { imageApi } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  imageApi: {
    vocabularies: jest.fn(),
    upload: jest.fn(),
  },
}));

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

const mockImageApi = imageApi as jest.Mocked<typeof imageApi>;
const mockUseRouter = useRouter as jest.Mock;

const vocabResponse = {
  hazard_types: [{ id: 'flood', label: 'Flood', description: '' }],
  countries: [{ id: 'fj', label: 'Fiji' }],
};

const renderWithClient = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <UploadPage />
    </QueryClientProvider>
  );
};

const fillRequiredFields = async () => {
  const hazardSelect = await screen.findByLabelText(/Hazard Type/i);
  fireEvent.change(hazardSelect, { target: { value: 'flood' } });

  const locationInput = screen.getByLabelText(/Location/i);
  fireEvent.change(locationInput, { target: { value: 'Port Vila' } });
};

const addMockFile = async () => {
  const fileInput = screen.getByLabelText(/Drop files here/i);
  const largeContent = 'a'.repeat(2048);
  const file = new File([largeContent], 'impact.jpg', { type: 'image/jpeg' });
  fireEvent.change(fileInput, { target: { files: [file] } });
  await screen.findByText(/impact.jpg/i);
};

const createFileList = (file?: File): FileList => {
  if (!file) {
    return { length: 0, item: () => null } as FileList;
  }

  const list: any = {
    0: file,
    length: 1,
    item: (index: number) => (index === 0 ? file : null),
  };
  return list as FileList;
};

class MockDataTransfer {
  files: FileList;
  items: { add: (file: File) => void };

  constructor() {
    this.files = createFileList();
    this.items = {
      add: (file: File) => {
        this.files = createFileList(file);
      },
    };
  }
}

describe('UploadPage citizen-science flow', () => {
  beforeAll(() => {
    Object.defineProperty(global, 'DataTransfer', {
      value: MockDataTransfer,
      writable: true,
    });
    global.URL.createObjectURL = jest.fn(() => 'blob:preview-url');
    global.URL.revokeObjectURL = jest.fn();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockImageApi.vocabularies.mockResolvedValue(vocabResponse);
    mockUseRouter.mockReturnValue({ push: jest.fn() });
  });

  afterAll(() => {
    (console.log as jest.Mock).mockRestore();
  });

  it('shows a validation error when submitting without a file', async () => {
    renderWithClient();
    await fillRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: /Upload Image/i }));

    expect(await screen.findByText(/Please select a file to upload/i)).toBeInTheDocument();
  });

  it('uploads a valid image and shows the success state', async () => {
    mockImageApi.upload.mockImplementation((_formData, onProgress) => {
      onProgress?.(60);
      return Promise.resolve({ id: 'img-123' });
    });

    renderWithClient();
    await fillRequiredFields();
    await addMockFile();

    fireEvent.click(screen.getByRole('button', { name: /Upload Image/i }));

    await waitFor(() => expect(mockImageApi.upload).toHaveBeenCalled());
    expect(await screen.findByText(/Upload completed successfully/i)).toBeInTheDocument();
  });

  it('surfaces upload failures to the curator', async () => {
    const error = new Error('Upload failed');
    mockImageApi.upload.mockRejectedValue(error);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    renderWithClient();
    await fillRequiredFields();
    await addMockFile();

    fireEvent.click(screen.getByRole('button', { name: /Upload Image/i }));

    expect(await screen.findByText(/Error uploading image/i)).toBeInTheDocument();

    (console.error as jest.Mock).mockRestore();
  });
});

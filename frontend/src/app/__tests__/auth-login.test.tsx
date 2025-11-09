import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from '@/app/auth/login/page';
import { useAuth } from '@/providers/auth-provider';
import { useRouter, useSearchParams } from 'next/navigation';

jest.mock('@/providers/auth-provider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseRouter = useRouter as jest.Mock;
const mockUseSearchParams = useSearchParams as jest.Mock;

const baseAuthValue = {
  user: null,
  session: null,
  isAuthenticated: false,
  isLoading: false,
  signIn: jest.fn(),
  signOut: jest.fn(),
  hasRole: jest.fn(),
  handleCallback: jest.fn(),
  error: null,
  clearError: jest.fn(),
};

const setup = (overrides = {}) => {
  const routerPush = jest.fn();
  mockUseRouter.mockReturnValue({ push: routerPush });
  mockUseSearchParams.mockReturnValue({
    get: jest.fn().mockReturnValue('/map'),
  });

  const authValue = { ...baseAuthValue, ...overrides };
  mockUseAuth.mockReturnValue(authValue);

  return { routerPush, authValue };
};

describe('LoginPage citizen-science flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows SSO call-to-action for anonymous visitors', () => {
    setup();

    render(<LoginPage />);

    expect(screen.getByText(/Discover Pacific Island Impact Data/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In with SPC SSO/i })).toBeInTheDocument();
    expect(screen.getByText(/Guest Access Available/i)).toBeInTheDocument();
  });

  it('starts the SSO sign-in flow with the returnUrl', async () => {
    const signIn = jest.fn().mockResolvedValue(undefined);
    setup({ signIn });

    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: /Sign In with SPC SSO/i }));

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith('/map');
    });
  });

  it('allows guests to continue without signing in', () => {
    const { routerPush } = setup();

    render(<LoginPage />);

    fireEvent.click(screen.getByText(/Continue as Guest/i));
    expect(routerPush).toHaveBeenCalledWith('/');
  });

  it('recovers when signIn fails and re-enables the button', async () => {
    const signInError = new Error('SSO failed');
    const signIn = jest.fn().mockRejectedValue(signInError);
    setup({ signIn });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: /Sign In with SPC SSO/i }));

    await waitFor(() => expect(signIn).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getByText(/Sign In with SPC SSO/i)).toBeInTheDocument();
    });

    (console.error as jest.Mock).mockRestore();
  });

  it('renders auth error banner with retry action', async () => {
    const signIn = jest.fn().mockResolvedValue(undefined);
    const clearError = jest.fn();
    setup({ signIn, clearError, error: 'Test auth error' });

    render(<LoginPage />);

    expect(screen.getByText(/Test auth error/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Retry sign-in/i }));
    await waitFor(() => expect(signIn).toHaveBeenCalled());
    expect(clearError).toHaveBeenCalled();
  });
});

import { render, screen } from '@testing-library/react';
import React from 'react';

import UserAnalytics, {
  formatCsv,
  generateTimelineSeries,
} from '@/components/profile/UserAnalyticsMock';

const rechartsSpies: { areaData?: any[] } = {};

jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map">{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  CircleMarker: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="circle-marker">{children}</div>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Pie: ({ data, onClick, children }: any) => (
    <div>
      {(data as any).map((entry: any, index: number) => (
        <button
          key={entry.name}
          aria-label={`Select ${entry.name} hazard category`}
          onClick={() => onClick?.(entry)}
        >
          {children?.[index] ?? null}
        </button>
      ))}
    </div>
  ),
  Cell: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ data, children }: any) => {
    rechartsSpies.areaData = data;
    return <div data-testid="area-chart">{children}</div>;
  },
  Area: () => <div />,
  CartesianGrid: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  Line: () => <div />,
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Bar: () => <div />,
}));

describe('UserAnalytics', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    rechartsSpies.areaData = undefined;
  });

  describe('data export', () => {
    let anchor: HTMLAnchorElement;

    beforeEach(() => {
      jest.useFakeTimers();
      anchor = document.createElement('a');
      jest.spyOn(anchor, 'click').mockImplementation(() => undefined);

      const originalCreateElement = document.createElement.bind(document);
      jest
        .spyOn(document, 'createElement')
        .mockImplementation((tagName: string) => {
          if (tagName === 'a') {
            return anchor;
          }
          return originalCreateElement(tagName);
        });
      jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
      jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    });

    it('exports CSV data and revokes the blob URL after a delay', async () => {
      render(<UserAnalytics />);

      screen.getByRole('button', { name: /csv/i }).click();

      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(anchor.download).toBe('user-uploads.csv');
      const blobArg = (URL.createObjectURL as jest.Mock).mock
        .calls[0][0] as Blob;
      await expect(blobArg.text()).resolves.toContain('date,uploads,views');

      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      jest.runAllTimers();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    });

    it('exports JSON data snapshot with expected fields', async () => {
      render(<UserAnalytics />);

      screen.getByRole('button', { name: /json/i }).click();

      expect(anchor.download).toBe('user-analytics.json');
      const blobArg = (URL.createObjectURL as jest.Mock).mock
        .calls[0][0] as Blob;
      const payloadText = await blobArg.text();
      const parsed = JSON.parse(payloadText);

      expect(parsed).toHaveProperty('uploads');
      expect(parsed).toHaveProperty('hazards');
      expect(parsed).toHaveProperty('locations');
      expect(parsed).toHaveProperty('benchmark');
    });
  });

  it('updates hazard drill-down when a pie slice is activated', () => {
    render(<UserAnalytics />);

    expect(screen.getByText(/Flood details/i)).toBeInTheDocument();
    screen
      .getByRole('button', { name: /select wildfire hazard category/i })
      .click();

    expect(screen.getByText(/Wildfire details/i)).toBeInTheDocument();
    expect(screen.getByText(/Peatland hotspot study/i)).toBeInTheDocument();
  });

  it('renders contribution calendar cells with accessible labels', () => {
    render(<UserAnalytics />);

    const cells = screen.getAllByLabelText(/uploads$/i);
    expect(cells.length).toBeGreaterThanOrEqual(180);
  });

  it('renders map markers for each upload location', () => {
    render(<UserAnalytics />);

    const markers = screen.getAllByTestId('circle-marker');
    expect(markers.length).toBeGreaterThanOrEqual(8);
  });

  it('passes timeline data into the area chart', () => {
    render(<UserAnalytics />);

    expect(rechartsSpies.areaData?.length).toBe(
      generateTimelineSeries().length
    );
  });

  it('renders benchmarking and leaderboard content', () => {
    render(<UserAnalytics />);

    expect(
      screen.getByText(/uploads map & heat intensity/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/You vs. community average/i)).toBeInTheDocument();
    expect(screen.getByText(/Most popular images/i)).toBeInTheDocument();
  });
});

describe('formatCsv', () => {
  it('returns empty string for empty datasets', () => {
    expect(formatCsv([])).toBe('');
  });
});

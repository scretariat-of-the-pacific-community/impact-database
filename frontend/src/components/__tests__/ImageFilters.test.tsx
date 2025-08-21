import { render, screen, fireEvent } from '@testing-library/react';
import ImageFilters, { FilterState } from '@/components/ImageFilters';

describe('ImageFilters', () => {
  const baseFilters: FilterState = {
    searchTerm: '',
    hazardTypes: [],
    countries: [],
    dateRange: {},
    sortBy: 'date',
    sortOrder: 'desc',
  };

  it('calls onFiltersChange when search term updates', () => {
    const handleChange = jest.fn();
    render(
      <ImageFilters
        filters={baseFilters}
        onFiltersChange={handleChange}
        availableHazardTypes={['flood']}
        availableCountries={['Fiji']}
        totalImages={10}
        filteredCount={10}
      />
    );

    const input = screen.getByPlaceholderText(/search by title/i);
    fireEvent.change(input, { target: { value: 'storm' } });

    expect(handleChange).toHaveBeenCalledWith({
      ...baseFilters,
      searchTerm: 'storm',
    });
  });

  it('toggles hazard type and triggers callback', () => {
    const handleChange = jest.fn();
    render(
      <ImageFilters
        filters={baseFilters}
        onFiltersChange={handleChange}
        availableHazardTypes={['flood']}
        availableCountries={['Fiji']}
        totalImages={10}
        filteredCount={10}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /hazard types/i }));
    const checkbox = screen.getByLabelText(/flood/i);
    fireEvent.click(checkbox);

    expect(handleChange).toHaveBeenCalledWith({
      ...baseFilters,
      hazardTypes: ['flood'],
    });
  });
});


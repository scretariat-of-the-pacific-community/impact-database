/**
 * Predictive Analytics & Forecasting
 * Uses statistical methods for trend prediction
 */

// @ts-ignore - regression library lacks TypeScript definitions
import regression from 'regression';

export interface ForecastPoint {
  period: string;
  value: number;
  isActual: boolean;
  isForecast: boolean;
  lowerBound?: number;
  upperBound?: number;
  confidence?: number;
}

export interface ForecastResult {
  forecast: ForecastPoint[];
  accuracy: number;
  method: string;
  trend: 'increasing' | 'decreasing' | 'stable';
}

/**
 * Calculate Simple Moving Average (SMA)
 */
function calculateSMA(data: number[], windowSize: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < windowSize - 1) {
      result.push(data[i]);
    } else {
      const window = data.slice(i - windowSize + 1, i + 1);
      const average = window.reduce((sum, val) => sum + val, 0) / windowSize;
      result.push(average);
    }
  }
  return result;
}

/**
 * Calculate Exponential Moving Average (EMA)
 */
function calculateEMA(data: number[], smoothing: number = 0.3): number[] {
  const result: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    const ema = data[i] * smoothing + result[i - 1] * (1 - smoothing);
    result.push(ema);
  }
  return result;
}

/**
 * Calculate Mean Absolute Percentage Error (MAPE)
 */
function calculateMAPE(actual: number[], predicted: number[]): number {
  let sum = 0;
  let count = 0;

  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== 0) {
      sum += Math.abs((actual[i] - predicted[i]) / actual[i]);
      count++;
    }
  }

  return count > 0 ? (sum / count) * 100 : 0;
}

/**
 * Generate date labels for future periods
 */
function generateFuturePeriods(
  lastPeriod: string | undefined,
  count: number,
  granularity: 'daily' | 'monthly' | 'yearly'
): string[] {
  const periods: string[] = [];

  // Validate input
  if (!lastPeriod || count <= 0) {
    console.warn(
      'generateFuturePeriods: Invalid input parameters detected.',
      'Expected lastPeriod (non-empty string) and count (positive number).',
      'Received:',
      {
        lastPeriod: lastPeriod ?? 'undefined',
        lastPeriodType: typeof lastPeriod,
        count,
        countType: typeof count,
        granularity,
      }
    );
    return [];
  }

  // Parse the last period based on granularity
  let date: Date | null = null;

  try {
    switch (granularity) {
      case 'daily': {
        // Expect format: YYYY-MM-DD or ISO string
        // Handle both ISO and simple date formats
        const dateStr = lastPeriod.includes('T')
          ? lastPeriod.split('T')[0]
          : lastPeriod;
        date = new Date(dateStr + 'T00:00:00.000Z');
        break;
      }
      case 'monthly': {
        // Expect format: YYYY-MM or similar
        if (lastPeriod.includes('-')) {
          const parts = lastPeriod.split('-');
          const year = parseInt(parts[0]);
          const month = parseInt(parts[1]);
          if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
            date = new Date(Date.UTC(year, month - 1, 1));
          }
        }
        if (!date) {
          // Fallback to standard parsing
          date = new Date(lastPeriod + '-01T00:00:00.000Z');
        }
        break;
      }
      case 'yearly': {
        // Expect format: YYYY
        const year = parseInt(lastPeriod);
        if (!isNaN(year) && year > 1900 && year < 2100) {
          date = new Date(Date.UTC(year, 0, 1));
        } else {
          date = new Date(lastPeriod + '-01-01T00:00:00.000Z');
        }
        break;
      }
      default:
        date = new Date(lastPeriod);
    }

    // Validate date
    if (!date || isNaN(date.getTime())) {
      console.error(
        'Invalid date parsed from:',
        lastPeriod,
        'for granularity:',
        granularity,
        'resulted in:',
        date
      );
      return [];
    }
  } catch (error) {
    console.error(
      'Error parsing date:',
      lastPeriod,
      'for granularity:',
      granularity,
      error
    );
    return [];
  }

  for (let i = 1; i <= count; i++) {
    try {
      let futureDate: Date;

      switch (granularity) {
        case 'daily': {
          futureDate = new Date(date);
          futureDate.setUTCDate(date.getUTCDate() + i);
          if (!isNaN(futureDate.getTime())) {
            periods.push(futureDate.toISOString().split('T')[0]);
          }
          break;
        }
        case 'monthly': {
          futureDate = new Date(date);
          futureDate.setUTCMonth(date.getUTCMonth() + i);
          if (!isNaN(futureDate.getTime())) {
            const monthStr = String(futureDate.getUTCMonth() + 1).padStart(
              2,
              '0'
            );
            periods.push(`${futureDate.getUTCFullYear()}-${monthStr}`);
          }
          break;
        }
        case 'yearly': {
          futureDate = new Date(date);
          futureDate.setUTCFullYear(date.getUTCFullYear() + i);
          if (!isNaN(futureDate.getTime())) {
            periods.push(futureDate.getUTCFullYear().toString());
          }
          break;
        }
      }
    } catch (error) {
      console.error(
        'Error generating future period:',
        i,
        'from',
        lastPeriod,
        error
      );
    }
  }

  return periods;
}

/**
 * Forecast using Moving Average
 */
export function forecastMovingAverage(
  historicalData: Record<string, number>,
  periodsAhead: number = 3,
  windowSize: number = 3,
  granularity: 'daily' | 'monthly' | 'yearly' = 'monthly'
): ForecastResult {
  const sortedEntries = Object.entries(historicalData).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const periods = sortedEntries.map(([key]) => key);
  const values = sortedEntries.map(([, value]) => value);

  // Validate we have data
  if (periods.length === 0 || values.length === 0) {
    return {
      forecast: [],
      accuracy: 0,
      method: 'moving-average',
      trend: 'stable',
    };
  }

  if (values.length < windowSize) {
    return {
      forecast: sortedEntries.map(([period, value]) => ({
        period,
        value,
        isActual: true,
        isForecast: false,
      })),
      accuracy: 0,
      method: 'moving-average',
      trend: 'stable',
    };
  }

  // Calculate moving average for historical data
  const sma = calculateSMA(values, windowSize);

  // Calculate accuracy using last few points
  const testSize = Math.min(periodsAhead, Math.floor(values.length * 0.2));
  const testActual = values.slice(-testSize);
  const testPredicted = sma.slice(-testSize);
  const accuracy = Math.max(0, 100 - calculateMAPE(testActual, testPredicted));

  // Forecast future values
  const lastAverage = sma[sma.length - 1];
  const recentTrend =
    values.slice(-3).reduce((sum, val, idx, arr) => {
      if (idx === 0) return 0;
      return sum + (val - arr[idx - 1]);
    }, 0) / 2;

  const futurePeriods = generateFuturePeriods(
    periods[periods.length - 1],
    periodsAhead,
    granularity
  );
  const forecast: ForecastPoint[] = [
    ...sortedEntries.map(([period, value]) => ({
      period,
      value,
      isActual: true,
      isForecast: false,
    })),
  ];

  futurePeriods.forEach((period, index) => {
    const predictedValue = Math.max(0, lastAverage + recentTrend * (index + 1));
    const uncertainty = predictedValue * (0.1 + index * 0.05); // Increasing uncertainty

    forecast.push({
      period,
      value: predictedValue,
      isActual: false,
      isForecast: true,
      lowerBound: Math.max(0, predictedValue - uncertainty),
      upperBound: predictedValue + uncertainty,
      confidence: Math.max(50, accuracy - index * 10),
    });
  });

  // Determine trend
  const trend =
    recentTrend > 2 ? 'increasing' : recentTrend < -2 ? 'decreasing' : 'stable';

  return {
    forecast,
    accuracy,
    method: 'moving-average',
    trend,
  };
}

/**
 * Forecast using Linear Regression
 */
export function forecastLinearRegression(
  historicalData: Record<string, number>,
  periodsAhead: number = 3,
  granularity: 'daily' | 'monthly' | 'yearly' = 'monthly'
): ForecastResult {
  const sortedEntries = Object.entries(historicalData).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const periods = sortedEntries.map(([key]) => key);
  const values = sortedEntries.map(([, value]) => value);

  // Validate we have data
  if (periods.length === 0 || values.length === 0) {
    return {
      forecast: [],
      accuracy: 0,
      method: 'linear-regression',
      trend: 'stable',
    };
  }

  if (values.length < 3) {
    return forecastMovingAverage(historicalData, periodsAhead, 2, granularity);
  }

  // Prepare data for regression (x = index, y = value)
  const regressionData: [number, number][] = values.map((value, index) => [
    index,
    value,
  ]);

  // Perform linear regression
  const result = regression.linear(regressionData);
  const { equation, r2 } = result;

  // Calculate predictions for historical data
  const predicted = values.map((_, index) => equation[0] * index + equation[1]);
  const accuracy = Math.max(0, 100 - calculateMAPE(values, predicted));

  // Generate forecast
  const futurePeriods = generateFuturePeriods(
    periods[periods.length - 1],
    periodsAhead,
    granularity
  );
  const forecast: ForecastPoint[] = [
    ...sortedEntries.map(([period, value]) => ({
      period,
      value,
      isActual: true,
      isForecast: false,
    })),
  ];

  futurePeriods.forEach((period, index) => {
    const x = values.length + index;
    const predictedValue = Math.max(0, equation[0] * x + equation[1]);
    const uncertainty = predictedValue * (0.15 + index * 0.05);

    forecast.push({
      period,
      value: predictedValue,
      isActual: false,
      isForecast: true,
      lowerBound: Math.max(0, predictedValue - uncertainty),
      upperBound: predictedValue + uncertainty,
      confidence: Math.max(50, accuracy - index * 10),
    });
  });

  // Determine trend from slope
  const trend =
    equation[0] > 0.5
      ? 'increasing'
      : equation[0] < -0.5
        ? 'decreasing'
        : 'stable';

  return {
    forecast,
    accuracy: Math.round(r2 * 100),
    method: 'linear-regression',
    trend,
  };
}

/**
 * Forecast using Exponential Smoothing
 */
export function forecastExponentialSmoothing(
  historicalData: Record<string, number>,
  periodsAhead: number = 3,
  alpha: number = 0.3,
  granularity: 'daily' | 'monthly' | 'yearly' = 'monthly'
): ForecastResult {
  const sortedEntries = Object.entries(historicalData).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const periods = sortedEntries.map(([key]) => key);
  const values = sortedEntries.map(([, value]) => value);

  // Validate we have data
  if (periods.length === 0 || values.length === 0) {
    return {
      forecast: [],
      accuracy: 0,
      method: 'exponential-smoothing',
      trend: 'stable',
    };
  }

  if (values.length < 2) {
    return forecastMovingAverage(historicalData, periodsAhead, 2, granularity);
  }

  // Calculate EMA for historical data
  const ema = calculateEMA(values, alpha);

  // Calculate accuracy
  const accuracy = Math.max(0, 100 - calculateMAPE(values, ema));

  // Forecast future values
  const lastEMA = ema[ema.length - 1];
  const futurePeriods = generateFuturePeriods(
    periods[periods.length - 1],
    periodsAhead,
    granularity
  );

  const forecast: ForecastPoint[] = [
    ...sortedEntries.map(([period, value]) => ({
      period,
      value,
      isActual: true,
      isForecast: false,
    })),
  ];

  let currentForecast = lastEMA;
  futurePeriods.forEach((period, index) => {
    const uncertainty = currentForecast * (0.12 + index * 0.04);

    forecast.push({
      period,
      value: Math.max(0, currentForecast),
      isActual: false,
      isForecast: true,
      lowerBound: Math.max(0, currentForecast - uncertainty),
      upperBound: currentForecast + uncertainty,
      confidence: Math.max(50, accuracy - index * 10),
    });

    // For exponential smoothing, next forecast is same as current
    currentForecast = currentForecast;
  });

  // Determine trend from recent values
  const recentValues = values.slice(-3);
  const avgChange =
    recentValues.reduce((sum, val, idx, arr) => {
      if (idx === 0) return 0;
      return sum + (val - arr[idx - 1]);
    }, 0) / 2;

  const trend =
    avgChange > 1 ? 'increasing' : avgChange < -1 ? 'decreasing' : 'stable';

  return {
    forecast,
    accuracy,
    method: 'exponential-smoothing',
    trend,
  };
}

/**
 * Auto-select best forecasting method based on data characteristics
 */
export function autoForecast(
  historicalData: Record<string, number>,
  periodsAhead: number = 3,
  granularity: 'daily' | 'monthly' | 'yearly' = 'monthly'
): ForecastResult {
  const values = Object.values(historicalData);

  // Use linear regression if there's a clear trend
  const firstHalf = values.slice(0, Math.floor(values.length / 2));
  const secondHalf = values.slice(Math.floor(values.length / 2));
  const firstAvg =
    firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
  const secondAvg =
    secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
  const trendStrength = Math.abs((secondAvg - firstAvg) / firstAvg);

  if (trendStrength > 0.2 && values.length >= 6) {
    return forecastLinearRegression(historicalData, periodsAhead, granularity);
  }

  // Use exponential smoothing for stable or slowly changing data
  if (values.length >= 4) {
    return forecastExponentialSmoothing(
      historicalData,
      periodsAhead,
      0.3,
      granularity
    );
  }

  // Fallback to moving average
  return forecastMovingAverage(
    historicalData,
    periodsAhead,
    Math.min(3, values.length),
    granularity
  );
}

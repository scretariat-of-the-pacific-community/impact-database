/**
 * Data Insights Engine
 * Analyzes disaster impact data to identify patterns and trends
 */

export interface Insight {
  id: string;
  type: 'trend' | 'anomaly' | 'correlation' | 'recommendation';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  value?: number;
  change?: number;
  confidence: number; // 0-100
  timestamp: Date;
}

interface TimeSeriesData {
  key: string;
  value: number;
}

interface AnalyticsData {
  totalImages: number;
  hazardDistribution: Record<string, number>;
  countryDistribution: Record<string, number>;
  monthlyUploads: Record<string, number>;
  dailyUploads: Record<string, number>;
  trends: {
    monthly: number;
    totalGrowth: number;
  };
  topHazards: Array<[string, number]>;
  topCountries: Array<[string, number]>;
}

/**
 * Calculate statistical measures
 */
function calculateStats(values: number[]) {
  if (values.length === 0) return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0 };
  
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  
  return {
    mean,
    median,
    stdDev,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

/**
 * Detect anomalies using statistical methods (values beyond 2 standard deviations)
 */
function detectAnomalies(data: TimeSeriesData[]): Insight[] {
  const insights: Insight[] = [];
  const values = data.map(d => d.value);
  const stats = calculateStats(values);
  
  data.forEach((point, index) => {
    const zScore = Math.abs((point.value - stats.mean) / stats.stdDev);
    
    if (zScore > 2 && stats.stdDev > 0) {
      const isHigh = point.value > stats.mean;
      insights.push({
        id: `anomaly-${index}`,
        type: 'anomaly',
        severity: zScore > 3 ? 'critical' : 'warning',
        title: `${isHigh ? 'Spike' : 'Drop'} detected in ${point.key}`,
        description: `Unusual ${isHigh ? 'increase' : 'decrease'} of ${Math.abs(((point.value - stats.mean) / stats.mean) * 100).toFixed(1)}% compared to average (${stats.mean.toFixed(1)})`,
        value: point.value,
        change: ((point.value - stats.mean) / stats.mean) * 100,
        confidence: Math.min(95, 60 + zScore * 10),
        timestamp: new Date(),
      });
    }
  });
  
  return insights;
}

/**
 * Analyze trends using moving averages
 */
function analyzeTrends(data: TimeSeriesData[], windowSize = 3): Insight[] {
  const insights: Insight[] = [];
  
  if (data.length < windowSize * 2) return insights;
  
  // Calculate moving average
  const movingAvg = (arr: number[], start: number, end: number) => {
    const slice = arr.slice(start, end);
    return slice.reduce((sum, val) => sum + val, 0) / slice.length;
  };
  
  const values = data.map(d => d.value);
  const recentAvg = movingAvg(values, values.length - windowSize, values.length);
  const previousAvg = movingAvg(values, values.length - windowSize * 2, values.length - windowSize);
  
  if (previousAvg > 0) {
    const trendChange = ((recentAvg - previousAvg) / previousAvg) * 100;
    
    if (Math.abs(trendChange) > 15) {
      insights.push({
        id: 'trend-overall',
        type: 'trend',
        severity: Math.abs(trendChange) > 30 ? 'warning' : 'info',
        title: `${trendChange > 0 ? 'Upward' : 'Downward'} trend detected`,
        description: `Recent activity shows a ${Math.abs(trendChange).toFixed(1)}% ${trendChange > 0 ? 'increase' : 'decrease'} compared to previous period`,
        value: recentAvg,
        change: trendChange,
        confidence: 75,
        timestamp: new Date(),
      });
    }
  }
  
  return insights;
}

/**
 * Find correlations between hazards and countries
 */
function findCorrelations(data: AnalyticsData): Insight[] {
  const insights: Insight[] = [];
  
  // Top hazard in top country
  if (data.topHazards.length > 0 && data.topCountries.length > 0) {
    const topHazard = data.topHazards[0];
    const topCountry = data.topCountries[0];
    
    insights.push({
      id: 'correlation-top',
      type: 'correlation',
      severity: 'info',
      title: `${topHazard[0]} most common in ${topCountry[0]}`,
      description: `${topCountry[0]} accounts for ${((topCountry[1] / data.totalImages) * 100).toFixed(1)}% of all records, with ${topHazard[0]} being the predominant hazard type`,
      confidence: 85,
      timestamp: new Date(),
    });
  }
  
  // Hazard diversity analysis
  const hazardCount = Object.keys(data.hazardDistribution).length;
  const countryCount = Object.keys(data.countryDistribution).length;
  
  if (hazardCount > 0 && countryCount > 0) {
    const diversity = hazardCount / countryCount;
    
    if (diversity > 2) {
      insights.push({
        id: 'correlation-diversity',
        type: 'correlation',
        severity: 'info',
        title: 'High hazard diversity detected',
        description: `Average of ${diversity.toFixed(1)} different hazard types per country, indicating varied climate vulnerability across regions`,
        confidence: 70,
        timestamp: new Date(),
      });
    }
  }
  
  return insights;
}

/**
 * Generate recommendations based on data patterns
 */
function generateRecommendations(data: AnalyticsData): Insight[] {
  const insights: Insight[] = [];
  
  // Low data quality check
  if (data.totalImages < 50) {
    insights.push({
      id: 'recommendation-data-quality',
      type: 'recommendation',
      severity: 'warning',
      title: 'Limited disaster impact imagery',
      description: `Only ${data.totalImages} images in the database. Expanding the collection of hazard impact imagery will improve regional disaster analysis`,
      confidence: 95,
      timestamp: new Date(),
    });
  }
  
  // Geographic coverage
  const countryCount = Object.keys(data.countryDistribution).length;
  if (countryCount < 5) {
    insights.push({
      id: 'recommendation-coverage',
      type: 'recommendation',
      severity: 'info',
      title: 'Expand Pacific Island coverage',
      description: `Currently tracking ${countryCount} ${countryCount === 1 ? 'country' : 'countries'}. Adding imagery from more Pacific Island nations will enhance regional hazard preparedness`,
      confidence: 80,
      timestamp: new Date(),
    });
  }
  
  // Recent activity check
  if (data.trends.monthly < -20) {
    insights.push({
      id: 'recommendation-activity',
      type: 'recommendation',
      severity: 'warning',
      title: 'Hazard documentation declining',
      description: `Monthly uploads decreased by ${Math.abs(data.trends.monthly).toFixed(1)}%. Maintaining active documentation helps track disaster patterns across the Pacific region`,
      confidence: 85,
      timestamp: new Date(),
    });
  }
  
  return insights;
}

/**
 * Main insights generation function
 */
export function generateInsights(data: AnalyticsData): Insight[] {
  const timeSeriesData = Object.entries(data.monthlyUploads)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ key, value }));
  
  const allInsights: Insight[] = [
    ...detectAnomalies(timeSeriesData),
    ...analyzeTrends(timeSeriesData),
    ...findCorrelations(data),
    ...generateRecommendations(data),
  ];
  
  // Sort by severity and confidence
  return allInsights.sort((a, b) => {
    const severityOrder = { critical: 3, warning: 2, info: 1 };
    const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.confidence - a.confidence;
  });
}

/**
 * Calculate statistical summary
 */
export function calculateStatistics(data: AnalyticsData) {
  const hazardValues = Object.values(data.hazardDistribution);
  const countryValues = Object.values(data.countryDistribution);
  const monthlyValues = Object.values(data.monthlyUploads);
  
  return {
    hazardStats: calculateStats(hazardValues),
    countryStats: calculateStats(countryValues),
    timeSeriesStats: calculateStats(monthlyValues),
    totalImages: data.totalImages,
    uniqueHazards: Object.keys(data.hazardDistribution).length,
    uniqueCountries: Object.keys(data.countryDistribution).length,
  };
}

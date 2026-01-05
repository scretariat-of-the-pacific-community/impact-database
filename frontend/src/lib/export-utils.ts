/**
 * Export Utilities for Analytics
 * Supports CSV, JSON, and PDF report generation
 */

import jsPDF from 'jspdf';

interface AnalyticsData {
  totalImages: number;
  hazardDistribution: Record<string, number>;
  countryDistribution: Record<string, number>;
  monthlyUploads: Record<string, number>;
  dailyUploads: Record<string, number>;
  yearlyUploads: Record<string, number>;
  trends: {
    monthly: number;
    totalGrowth: number;
  };
  topHazards: Array<[string, number]>;
  topCountries: Array<[string, number]>;
}

/**
 * Export data as JSON file
 */
export function exportJSON(data: AnalyticsData, filename?: string): void {
  const dataStr = JSON.stringify(data, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `analytics-${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Export data as enhanced CSV with metadata
 */
export function exportCSV(data: AnalyticsData, filename?: string): void {
  const rows: string[][] = [
    ['Pacific Impact Atlas - Analytics Report'],
    ['Generated:', new Date().toISOString()],
    [''],
    ['=== SUMMARY METRICS ==='],
    ['Metric', 'Value'],
    ['Total Images', data.totalImages.toString()],
    ['Monthly Trend', `${data.trends.monthly > 0 ? '+' : ''}${data.trends.monthly.toFixed(2)}%`],
    ['Total Growth', `${data.trends.totalGrowth > 0 ? '+' : ''}${data.trends.totalGrowth.toFixed(2)}%`],
    ['Unique Hazard Types', Object.keys(data.hazardDistribution).length.toString()],
    ['Unique Countries', Object.keys(data.countryDistribution).length.toString()],
    [''],
    ['=== HAZARD DISTRIBUTION ==='],
    ['Hazard Type', 'Count', 'Percentage'],
    ...Object.entries(data.hazardDistribution)
      .sort(([, a], [, b]) => b - a)
      .map(([hazard, count]) => [
        hazard,
        count.toString(),
        `${((count / data.totalImages) * 100).toFixed(2)}%`
      ]),
    [''],
    ['=== COUNTRY DISTRIBUTION ==='],
    ['Country', 'Count', 'Percentage'],
    ...Object.entries(data.countryDistribution)
      .sort(([, a], [, b]) => b - a)
      .map(([country, count]) => [
        country,
        count.toString(),
        `${((count / data.totalImages) * 100).toFixed(2)}%`
      ]),
    [''],
    ['=== MONTHLY UPLOADS ==='],
    ['Month', 'Count'],
    ...Object.entries(data.monthlyUploads)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => [month, count.toString()]),
  ];

  const csv = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `analytics-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Capture a DOM element as an image
 */
async function captureElement(elementId: string): Promise<string | null> {
  const element = document.getElementById(elementId);
  if (!element) return null;

  try {
    // Dynamic import to avoid SSR issues
    const html2canvas = (await import('html2canvas')).default;
    
    const canvas = await html2canvas(element, {
      backgroundColor: '#020917',
      scale: 2,
      logging: false,
      allowTaint: true,
      useCORS: true,
    });
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('Error capturing element:', error);
    return null;
  }
}

/**
 * Generate comprehensive PDF report
 */
export async function exportPDF(
  data: AnalyticsData,
  chartIds: string[] = [],
  filename?: string
): Promise<void> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let yPosition = 20;

  // Add title page
  pdf.setFontSize(24);
  pdf.setTextColor(0, 158, 224); // Pacific blue
  pdf.text('Pacific Impact Atlas', pageWidth / 2, yPosition, { align: 'center' });
  
  yPosition += 12;
  pdf.setFontSize(18);
  pdf.setTextColor(100, 100, 100);
  pdf.text('Analytics Report', pageWidth / 2, yPosition, { align: 'center' });
  
  yPosition += 10;
  pdf.setFontSize(10);
  pdf.setTextColor(150, 150, 150);
  pdf.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, yPosition, { align: 'center' });
  
  // Executive Summary
  yPosition = 50;
  pdf.setFontSize(16);
  pdf.setTextColor(0, 0, 0);
  pdf.text('Executive Summary', 20, yPosition);
  
  yPosition += 10;
  pdf.setFontSize(10);
  pdf.setTextColor(80, 80, 80);
  
  const summaryData = [
    ['Total Images:', data.totalImages.toString()],
    ['Unique Hazards:', Object.keys(data.hazardDistribution).length.toString()],
    ['Unique Countries:', Object.keys(data.countryDistribution).length.toString()],
    ['Monthly Trend:', `${data.trends.monthly > 0 ? '+' : ''}${data.trends.monthly.toFixed(2)}%`],
    ['Overall Growth:', `${data.trends.totalGrowth > 0 ? '+' : ''}${data.trends.totalGrowth.toFixed(2)}%`],
  ];

  summaryData.forEach(([label, value]) => {
    pdf.text(label, 25, yPosition);
    pdf.setFont('helvetica', 'bold');
    pdf.text(value, 80, yPosition);
    pdf.setFont('helvetica', 'normal');
    yPosition += 7;
  });

  // Top Hazards
  yPosition += 10;
  pdf.setFontSize(14);
  pdf.setTextColor(0, 0, 0);
  pdf.text('Top Hazard Types', 20, yPosition);
  
  yPosition += 8;
  pdf.setFontSize(9);
  data.topHazards.slice(0, 5).forEach(([hazard, count], index) => {
    const percentage = ((count / data.totalImages) * 100).toFixed(1);
    pdf.text(`${index + 1}. ${hazard}`, 25, yPosition);
    pdf.text(`${count} (${percentage}%)`, pageWidth - 40, yPosition);
    yPosition += 6;
  });

  // Top Countries
  yPosition += 8;
  pdf.setFontSize(14);
  pdf.setTextColor(0, 0, 0);
  pdf.text('Top Countries', 20, yPosition);
  
  yPosition += 8;
  pdf.setFontSize(9);
  data.topCountries.slice(0, 5).forEach(([country, count], index) => {
    const percentage = ((count / data.totalImages) * 100).toFixed(1);
    pdf.text(`${index + 1}. ${country}`, 25, yPosition);
    pdf.text(`${count} (${percentage}%)`, pageWidth - 40, yPosition);
    yPosition += 6;
  });

  // Capture and add charts
  if (chartIds.length > 0) {
    for (const chartId of chartIds) {
      pdf.addPage();
      yPosition = 20;
      
      pdf.setFontSize(14);
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Chart: ${chartId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`, 20, yPosition);
      
      const imageData = await captureElement(chartId);
      if (imageData) {
        const imgWidth = pageWidth - 40;
        const imgHeight = (imgWidth * 3) / 4; // 4:3 aspect ratio
        
        if (yPosition + imgHeight > pageHeight - 20) {
          pdf.addPage();
          yPosition = 20;
        }
        
        pdf.addImage(imageData, 'PNG', 20, yPosition + 10, imgWidth, imgHeight);
      }
    }
  }

  // Footer on last page
  pdf.setFontSize(8);
  pdf.setTextColor(150, 150, 150);
  pdf.text(
    'Pacific Impact Atlas - Disaster Evidence Documentation',
    pageWidth / 2,
    pageHeight - 10,
    { align: 'center' }
  );

  // Save PDF
  pdf.save(filename || `analytics-report-${new Date().toISOString().split('T')[0]}.pdf`);
}

/**
 * Export data for a specific time period
 */
export function exportTimeSeriesCSV(
  monthlyData: Record<string, number>,
  filename?: string
): void {
  const rows: string[][] = [
    ['Month', 'Upload Count'],
    ...Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => [month, count.toString()]),
  ];

  const csv = rows.map(row => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `time-series-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

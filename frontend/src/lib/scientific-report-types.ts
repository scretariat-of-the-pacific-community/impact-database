/**
 * Scientific Report Types and Interfaces
 */

export interface ImpactMetrics {
  // Human impact
  peopleAffected?: number;
  peopleInjured?: number;
  peopleMissing?: number;
  peopleDisplaced?: number;
  fatalities?: number;

  // Infrastructure impact
  buildingsDamaged?: number;
  buildingsDestroyed?: number;
  criticalInfrastructureAffected?: string[];

  // Economic impact
  economicLossUsd?: number;
  insuredLossUsd?: number;

  // Environmental impact
  areaAffectedKm2?: number;
  ecosystemsAffected?: string[];
  speciesThreatened?: string[];

  // Recovery
  recoveryTimeMonths?: number;
  recoveryCostUsd?: number;
}

export interface CitizenDataLink {
  contentId: string;
  contentType: 'image' | 'video';
  citationType: 'evidence' | 'validation' | 'context' | 'impact';
  relevanceScore: number;
  notes?: string;
}

export interface ScientificReport {
  id: string;
  title: string;
  description: string;
  reportType: 'scientific' | 'assessment' | 'policy' | 'research';
  datePublished: string;
  authorOrganization?: string;
  authorContact?: string;
  confidenceLevel: 'low' | 'medium' | 'high' | 'very_high';
  peerReviewed: boolean;
  isPublished: boolean;
  createdAt: string;
  createdBy: string;
  linkedDataCount: number;
  linkedCitizenData?: CitizenDataLink[];
  impactMetrics?: ImpactMetrics;
  dateStart?: string;
  dateEnd?: string;
}

export interface ScientificReportSubmission {
  title: string;
  description: string;
  reportType: 'scientific' | 'assessment' | 'policy' | 'research';
  datePublished: string;
  authorOrganization?: string;
  authorContact?: string;
  confidenceLevel: 'low' | 'medium' | 'high' | 'very_high';
  peerReviewed: boolean;
  dateStart?: string;
  dateEnd?: string;
  metrics?: ImpactMetrics;
  linkedUploads?: CitizenDataLink[];
}

export interface HazardType {
  id: string;
  label: string;
  category: string;
  icon?: string;
  description?: string;
}

export interface ImpactType {
  id: string;
  label: string;
  category: string;
  unit?: string;
  description?: string;
}

export interface CitizenUploadWithCitation {
  id: string;
  filename: string;
  title?: string;
  hazardType?: string;
  location?: string;
  citationType: string;
  relevanceScore: number;
  reportId: string;
  contentType: 'image' | 'video';
}

export interface PublishedReport {
  id: string;
  title: string;
  reportType: string;
  datePublished: string;
  authorOrganization?: string;
  peerReviewed: boolean;
  linkedDataCount: number;
}

export interface ReportWithCitations {
  report: ScientificReport;
  citations: CitizenDataLink[];
}

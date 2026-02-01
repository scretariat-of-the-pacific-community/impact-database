/**
 * Scientific Reports API Client
 */

import {
  ScientificReport,
  ScientificReportSubmission,
  CitizenDataLink,
} from "./scientific-report-types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const scientificReportsApi = {
  // Create a new scientific report
  createReport: async (data: ScientificReportSubmission): Promise<{ report_id: string }> => {
    const response = await fetch(`${API_BASE}/api/scientific-reports/reports`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: data.title,
        description: data.description,
        report_type: data.reportType,
        date_published: data.datePublished,
        author_organization: data.authorOrganization,
        author_contact: data.authorContact,
        confidence_level: data.confidenceLevel,
        peer_reviewed: data.peerReviewed,
        date_start: data.dateStart,
        date_end: data.dateEnd,
        metrics: data.metrics ? {
          people_affected: data.metrics.peopleAffected,
          people_injured: data.metrics.peopleInjured,
          people_missing: data.metrics.peopleMissing,
          people_displaced: data.metrics.peopleDisplaced,
          fatalities: data.metrics.fatalities,
          buildings_damaged: data.metrics.buildingsDamaged,
          buildings_destroyed: data.metrics.buildingsDestroyed,
          critical_infrastructure_affected: data.metrics.criticalInfrastructureAffected,
          economic_loss_usd: data.metrics.economicLossUsd,
          insured_loss_usd: data.metrics.insuredLossUsd,
          area_affected_km2: data.metrics.areaAffectedKm2,
          ecosystems_affected: data.metrics.ecosystemsAffected,
          species_threatened: data.metrics.speciesThreatened,
          recovery_time_months: data.metrics.recoveryTimeMonths,
          recovery_cost_usd: data.metrics.recoveryCostUsd,
        } : null,
        linked_uploads: data.linkedUploads?.map((link) => ({
          content_id: link.contentId,
          content_type: link.contentType,
          citation_type: link.citationType,
          relevance_score: link.relevanceScore,
          notes: link.notes,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to create report");
    }

    return response.json();
  },

  // Get a specific scientific report
  getReport: async (reportId: string): Promise<ScientificReport> => {
    const response = await fetch(`${API_BASE}/api/scientific-reports/reports/${reportId}`, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch report");
    }

    return response.json();
  },

  // List scientific reports
  listReports: async (options?: {
    skip?: number;
    limit?: number;
    reportType?: string;
    authorOrg?: string;
    peerReviewed?: boolean;
  }): Promise<{ total: number; reports: ScientificReport[] }> => {
    const params = new URLSearchParams();
    if (options?.skip !== undefined) params.append("skip", options.skip.toString());
    if (options?.limit !== undefined) params.append("limit", options.limit.toString());
    if (options?.reportType) params.append("report_type", options.reportType);
    if (options?.authorOrg) params.append("author_org", options.authorOrg);
    if (options?.peerReviewed !== undefined) params.append("peer_reviewed", options.peerReviewed.toString());

    const response = await fetch(
      `${API_BASE}/api/scientific-reports/reports?${params.toString()}`,
      {
        method: "GET",
        credentials: "include",
      }
    );

    if (!response.ok) {
      throw new Error("Failed to fetch reports");
    }

    return response.json();
  },

  // Update a scientific report
  updateReport: async (
    reportId: string,
    data: Partial<ScientificReportSubmission>
  ): Promise<{ success: boolean }> => {
    const response = await fetch(`${API_BASE}/api/scientific-reports/reports/${reportId}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to update report");
    }

    return response.json();
  },

  // Delete a scientific report
  deleteReport: async (reportId: string): Promise<{ success: boolean }> => {
    const response = await fetch(`${API_BASE}/api/scientific-reports/reports/${reportId}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to delete report");
    }

    return response.json();
  },

  // Link citizen data to a report
  linkCitizenData: async (
    reportId: string,
    links: CitizenDataLink[]
  ): Promise<{ success: boolean; added_count: number }> => {
    const response = await fetch(
      `${API_BASE}/api/scientific-reports/reports/${reportId}/link-citizen-data`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          links.map((link) => ({
            content_id: link.contentId,
            content_type: link.contentType,
            citation_type: link.citationType,
            relevance_score: link.relevanceScore,
            notes: link.notes,
          }))
        ),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to link citizen data");
    }

    return response.json();
  },

  // Get citizen uploads linked to reports
  getLinkedCitizenUploads: async (options?: {
    reportId?: string;
    hazardType?: string;
    limit?: number;
  }): Promise<{ total: number; uploads: any[] }> => {
    const params = new URLSearchParams();
    if (options?.reportId) params.append("report_id", options.reportId);
    if (options?.hazardType) params.append("hazard_type", options.hazardType);
    if (options?.limit) params.append("limit", options.limit.toString());

    const response = await fetch(
      `${API_BASE}/api/scientific-reports/citizen-uploads/linked?${params.toString()}`,
      {
        method: "GET",
        credentials: "include",
      }
    );

    if (!response.ok) {
      throw new Error("Failed to fetch linked uploads");
    }

    return response.json();
  },

  // Get citations for a specific citizen upload
  getCitationsForContent: async (
    contentId: string
  ): Promise<{ content_id: string; citation_count: number; reports: ScientificReport[] }> => {
    const response = await fetch(
      `${API_BASE}/api/scientific-reports/citations/${contentId}`,
      {
        method: "GET",
        credentials: "include",
      }
    );

    if (!response.ok) {
      throw new Error("Failed to fetch citations");
    }

    return response.json();
  },

  // Publish a scientific report (admin only)
  publishReport: async (reportId: string): Promise<{ success: boolean }> => {
    const response = await fetch(
      `${API_BASE}/api/scientific-reports/reports/${reportId}/publish`,
      {
        method: "POST",
        credentials: "include",
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to publish report");
    }

    return response.json();
  },
};

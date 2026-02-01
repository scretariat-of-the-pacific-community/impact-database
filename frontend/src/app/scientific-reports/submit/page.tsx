"use client";

import React, { useState } from "react";
import { ScientificReportForm } from "@/components/scientific-reports/ScientificReportForm";
import { CitizenDataLinkingPanel } from "@/components/scientific-reports/CitizenDataLinkingPanel";
import { CitizenDataLink } from "@/lib/scientific-report-types";

export default function SubmitReportPage() {
  const [linkedData, setLinkedData] = useState<CitizenDataLink[]>([]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Submit Scientific Report</h1>
          <p className="text-gray-600 mt-2">
            Share your research and link citizen-contributed data as evidence of impact
          </p>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">How review works</h2>
            <p className="mt-2 text-sm text-gray-600">
              Submissions are screened for completeness and evidence quality. Typical review time is 3-5 business days.
            </p>
          </div>
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">Data use & attribution</h2>
            <p className="mt-2 text-sm text-gray-600">
              Your report and linked evidence may be cited with attribution. You can update or retract data after submission.
            </p>
          </div>
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">Evidence expectations</h2>
            <p className="mt-2 text-sm text-gray-600">
              Link citizen uploads or tagged images that substantiate key claims. More evidence improves review speed.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Form - Takes 2 columns */}
          <div className="lg:col-span-2">
            <ScientificReportForm linkedUploads={linkedData} />
          </div>

          {/* Sidebar - Citizen Data Linking */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 bg-white p-6 border rounded-lg shadow-sm">
              <CitizenDataLinkingPanel
                onLinksSelected={setLinkedData}
                selectedLinks={linkedData}
                maxSelections={50}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

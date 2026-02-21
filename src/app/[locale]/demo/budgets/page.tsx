import { BudgetComparison } from "@/components/budgets/BudgetComparison";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Budget Comparison Demo | OpenCouncil",
  description: "Interactive comparison of Greek municipal budgets - GSoC 2026 Prototype",
};

/**
 * Demo page for the Budget Comparison component
 * 
 * This page showcases the Budget Comparison prototype built as part of the
 * GSoC 2026 proposal for the Municipal Budget and Technical Program Visualization Tool.
 * 
 * Navigate to: /demo/budgets to view this page in the browser
 */
export default function BudgetDemoPage() {
  return (
    <div className="container py-8 space-y-8">
      {/* Page Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">
          Municipal Budget Comparison
        </h1>
        <p className="text-xl text-muted-foreground">
          GSoC 2026 Prototype - Interactive Budget Visualization Tool
        </p>
      </div>

      {/* Component Demo */}
      <BudgetComparison />

      {/* Implementation Notes */}
      <div className="rounded-lg border border-muted bg-muted/50 p-6 space-y-4">
        <h2 className="text-2xl font-semibold">Implementation Notes</h2>
        
        <div className="space-y-4 text-sm">
          <div>
            <h3 className="font-semibold mb-2">What This Prototype Demonstrates:</h3>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Responsive chart visualizations using Recharts</li>
              <li>Interactive municipality selection</li>
              <li>Absolute vs per-capita view toggling</li>
              <li>Bilingual support (Greek/English)</li>
              <li>Mobile-responsive design</li>
              <li>Integration with OpenCouncil's design system</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Technical Stack:</h3>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Next.js 14 with App Router</li>
              <li>TypeScript (strict mode)</li>
              <li>Recharts for data visualization</li>
              <li>Shadcn UI components</li>
              <li>Tailwind CSS for styling</li>
              <li>next-intl for internationalization</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Full Implementation Plan (GSoC 2026):</h3>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Phase 1 (120 hrs):</strong> PDF processing pipeline with table extraction</li>
              <li><strong>Phase 2 (100 hrs):</strong> Database schema, API endpoints, search indexing</li>
              <li><strong>Phase 3 (130 hrs):</strong> Complete UI with time series, exports, and map integration</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Next Steps:</h3>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Collect 20+ real budget PDFs from different municipalities</li>
              <li>Analyze PDF format variations and extraction challenges</li>
              <li>Design database schema for production</li>
              <li>Create comprehensive test suite</li>
              <li>Build admin interface for PDF uploads and validation</li>
            </ul>
          </div>

          <div className="border-t pt-4 mt-4">
            <p className="text-muted-foreground">
              <strong>GSoC 2026 Project:</strong> Municipal Budget and Technical Program Visualization Tool
              <br />
              <strong>Mentors:</strong> Andreas Kouloumos, Christos Porios
              <br />
              <strong>Related Issue:</strong>{" "}
              <a 
                href="https://github.com/schemalabz/opencouncil/issues/176" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                #176 Budget and Technical Programs Extraction Tool
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

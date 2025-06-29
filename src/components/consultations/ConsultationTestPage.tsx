"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import ConsultationMap from "./ConsultationMap";
import { RegulationData } from "./types";

// Import the example data
import athensScooterRegulation from "@/lib/examples/athens-scooter-regulation.json";

export default function ConsultationTestPage() {
    const regulationData = athensScooterRegulation as RegulationData;
    const baseUrl = "/test-consultation";

    const handleReferenceClick = (referenceId: string) => {
        console.log("Reference clicked:", referenceId);
        // This would normally navigate to the reference or open the appropriate detail panel
        // The URL routing is already handled by the ConsultationMap component
    };

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <div className="border-b bg-white">
                <div className="max-w-4xl mx-auto p-4">
                    <h1 className="text-2xl font-bold mb-2">{regulationData.title}</h1>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>📧 {regulationData.contactEmail}</span>
                        <span>📄 {regulationData.sources.length} πηγές</span>
                        <span>🗺️ Διαδραστικός χάρτης</span>
                    </div>
                </div>
            </div>

            {/* Map View */}
            <div className="h-[calc(100vh-200px)]">
                <ConsultationMap
                    regulationData={regulationData}
                    baseUrl={baseUrl}
                    referenceFormat={regulationData.referenceFormat}
                    onReferenceClick={handleReferenceClick}
                    className="w-full h-full"
                />
            </div>

            {/* Instructions */}
            <div className="max-w-4xl mx-auto p-4 text-sm text-muted-foreground">
                <p><strong>Οδηγίες Χρήσης:</strong></p>
                <ul className="list-disc list-inside space-y-1 mt-2">
                    <li>Κάντε κλικ στο κουμπί επιπέδων για να δείτε/κρύψετε στοιχεία του χάρτη</li>
                    <li>Κάντε κλικ στο εικονίδιο πληροφοριών (ℹ️) για να δείτε λεπτομέρειες</li>
                    <li>Κάντε κλικ σε μια περιοχή στον χάρτη για να ανοίξετε τις λεπτομέρειές της</li>
                    <li>Χρησιμοποιήστε τα permalink για να μοιραστείτε συγκεκριμένες περιοχές</li>
                </ul>
            </div>
        </div>
    );
} 
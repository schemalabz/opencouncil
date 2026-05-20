import { Metadata } from "next";
import { Suspense } from "react";
import { UploadMockup } from "./UploadMockup";

export const metadata: Metadata = {
    title: "Ανέβασμα συνεδρίασης (mockup) | OpenCouncil",
    description: "UI mockup για το issue #300 — direct upload συνεδριάσεων από δήμους.",
    robots: { index: false, follow: false },
};

export default function UploadMockupPage() {
    return (
        <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">Loading mockup…</div>}>
            <UploadMockup />
        </Suspense>
    );
}

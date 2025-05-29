import { Metadata } from "next";
import { SignupPageContent } from "@/components/notifications/SignupPageContent";
import { Suspense } from "react";

export const metadata: Metadata = {
    title: "Γραφτείτε στις ενημερώσεις | OpenCouncil",
    description: "Λάβετε ενημερώσεις για θέματα που συζητιούνται στα δημοτικά συμβούλια που σας ενδιαφέρουν",
};

export default function SignupPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        }>
            <SignupPageContent />
        </Suspense>
    );
}
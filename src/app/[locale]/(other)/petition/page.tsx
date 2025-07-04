import { Metadata } from "next";
import { Suspense } from "react";
import { CheckCircle2 } from 'lucide-react';
import { PetitionMunicipalitySelector } from "@/components/onboarding/selectors/PetitionMunicipalitySelector";
import { OpenCouncilDescription } from "@/components/landing/OpenCouncilDescription";
import { getAllCitiesMinimalCached } from "@/lib/cache/queries";

export const metadata: Metadata = {
    title: "Υποστήριξη Δήμου | OpenCouncil",
    description: "Υποστηρίξτε την προσθήκη του δήμου σας στο OpenCouncil",
};

export default async function PetitionPage() {
    // Fetch all cities
    const cities = await getAllCitiesMinimalCached().catch(error => {
        console.error('Failed to fetch cities:', error);
        return [];
    });

    return (
        <div className="min-h-screen flex flex-col items-center justify-start px-4 pt-8 pb-8 sm:pt-12 sm:pb-12">
            <div className="w-full max-w-3xl mx-auto space-y-8 sm:space-y-12">
                {/* Header Section */}
                <div className="text-center space-y-4 sm:space-y-6">
                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-normal leading-tight">
                        Υποστηρίξτε την προσθήκη του Δήμου σας στο{' '}
                        <span className="relative z-10 text-[hsl(var(--orange))]">
                            OpenCouncil
                        </span>
                    </h1>
                </div>

                {/* Description Section */}
                <div className="space-y-4 sm:space-y-6">
                    <div className="text-base sm:text-lg text-muted-foreground text-center">
                        <OpenCouncilDescription />
                    </div>

                    <p className="text-base sm:text-lg text-muted-foreground text-left leading-relaxed">
                        Μπορείτε να μας βοηθήσετε να φέρουμε το δήμο σας στο OpenCouncil, επιτρέποντας μας να χρησιμοποιήσουμε το
                        όνομά σας όταν μιλήσουμε με το δήμο, ως δημότη που θα ήθελε να έχει το OpenCouncil στο δήμο του.
                    </p>
                </div>

                {/* Municipality Selector Section */}
                <div className="w-full">
                    <Suspense fallback={
                        <div className="flex items-center justify-center min-h-[200px]">
                            <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-primary"></div>
                        </div>
                    }>
                        <PetitionMunicipalitySelector cities={cities} />
                    </Suspense>
                </div>

                {/* Pricing Information */}
                <div className="space-y-4">
                    <p className="text-sm sm:text-base text-muted-foreground text-left leading-relaxed">
                        Έχουμε εμπορική δραστηριότητα με τους δήμους που συνεργαζόμαστε. Οι τιμές και ο τρόπος που τιμολογούμε είναι δημόσια διαθέσιμες στο{' '}
                        <a
                            href="https://opencouncil.gr/about"
                            className="text-blue-600 hover:text-blue-800 underline transition-colors duration-200"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            opencouncil.gr/about
                        </a>.
                    </p>

                    {/* Success Message */}
                    <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <p className="text-sm sm:text-base text-green-800 font-medium leading-relaxed">
                            Θα σας ενημερώσουμε όταν ο δήμος ενταχθεί στο δίκτυο OpenCouncil
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
} 
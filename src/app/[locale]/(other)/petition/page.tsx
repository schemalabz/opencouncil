import { Metadata } from "next";
import { Suspense } from "react";
import { MunicipalitySelector } from "@/components/onboarding/selectors/MunicipalitySelector";
import { CheckCircle2 } from 'lucide-react';
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
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-2xl mx-auto space-y-8">
                <div className="text-center space-y-6">
                    <h1 className="text-3xl sm:text-4xl font-normal">
                        Υποστηρίξτε την προσθήκη του Δήμου σας στο{' '}
                        <span className="relative z-10 text-[hsl(var(--orange))]">
                            OpenCouncil
                        </span>
                    </h1>
                    
                    <div className="space-y-4 text-lg text-muted-foreground">
                        <OpenCouncilDescription />
                        <p>
                            Μπορείτε να μας βοηθήσετε να φέρουμε το δήμο σας στο OpenCouncil, επιτρέποντας μας να χρησιμοποιήσουμε το
                            όνομά σας όταν μιλήσουμε με το δήμο, ως δημότη που θα ήθελε να έχει το OpenCouncil στο δήμο του.
                        </p>
                    </div>
                </div>

                <Suspense fallback={
                    <div className="flex items-center justify-center min-h-[200px]">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    </div>
                }>
                    <MunicipalitySelector cities={cities} hideQuickSelection />
                </Suspense>

                <p className="text-center text-lg text-muted-foreground">
                    Έχουμε εμπορική δραστηριότητα με τους δήμους που συνεργαζόμαστε. Οι τιμές και ο τρόπος που τιμολογούμε είναι δημόσια διαθέσιμες στο <a href="https://opencouncil.gr/about" className="text-blue-500 hover:underline">opencouncil.gr/about</a>.
                </p>

                <div className="flex items-center justify-center gap-2 text-green-700">
                    <CheckCircle2 className="h-5 w-5" />
                    <p className="font-medium">Θα σας ενημερώσουμε όταν ο δήμος ενταχθεί στο δίκτυο OpenCouncil</p>
                </div>
            </div>
        </div>
    );
} 
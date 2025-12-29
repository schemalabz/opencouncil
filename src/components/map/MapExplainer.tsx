'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { HelpCircle } from 'lucide-react';
import Link from 'next/link';

export function MapExplainer() {
    const [open, setOpen] = useState(false);

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <Button
                onClick={() => setOpen(true)}
                size="lg"
                className="fixed bottom-6 left-[110px] sm:left-[160px] z-40 rounded-full shadow-lg h-14 px-6 gap-2 bg-white hover:bg-gray-50 text-foreground border border-border"
            >
                <HelpCircle className="h-5 w-5" />
                <span className="hidden sm:inline">Τι είναι αυτό;</span>
            </Button>

            <SheetContent side="left" className="w-full sm:max-w-lg overflow-y-auto">
                <SheetHeader className="text-left mb-6">
                    <SheetTitle className="text-2xl">Ο Χάρτης του OpenCouncil</SheetTitle>
                </SheetHeader>

                <div className="space-y-4 text-sm leading-relaxed">
                    <p>
                        Σε αυτό το χάρτη μπορείτε να δείτε <strong>θέματα που συζητάνε οι δήμοι</strong> που συμμετέχουν στο OpenCouncil στα δημοτικά συμβούλια. Μπορείτε να φιλτράρετε για πιο πρόσφατα θέματα, ή για θέματα σε συγκεκριμένες θεματικές.
                    </p>

                    <p>
                        Τα θέματα και οι τοποθεσίες τους εξάγονται και οργανώνονται <strong>αυτόματα με τη χρήση τεχνητής νοημοσύνης</strong>.
                    </p>

                    <p>
                        <strong>Εμφανίζονται μόνο</strong> τα θέματα που αφορούν κάποια <strong>συγκεκριμένη τοποθεσία</strong> (π.χ. ένα θέμα που αφορά κάποια λαϊκή αγορά, αλλά όχι κάποιο θέμα που αφορά το προϋπολογισμό του δήμου), και μόνο από συνεδριάσεις που καλύπτει το OpenCouncil <strong>με την υποστήριξη του δήμου</strong>.
                    </p>

                    <p>
                        Μπορείτε να μάθετε περισσότερα για ένα θέμα <strong>πατώντας πάνω του</strong>, και να ανοίξετε τη σελίδα του θέματος για να δείτε τις τοποθετήσεις των μελών του δημοτικού συμβουλίου, ή και τη πλήρη απομαγνητοφώνηση της συνεδρίασης.
                    </p>

                    <div className="pt-4 border-t border-border">
                        <p className="mb-3">
                            Αν ο δήμος σας <strong>δεν συμμετέχει</strong> στο OpenCouncil, μπορείτε να <strong>ζητήσετε την ένταξη του</strong> πατώντας πάνω του.
                        </p>
                        <p>
                            Αν είστε υπάλληλος ή αιρετός του δήμου, σας προτείνουμε να διαβάσετε τη σελίδα{' '}
                            <Link
                                href="/about"
                                className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                                onClick={() => setOpen(false)}
                            >
                                Για Δήμους
                            </Link>
                            .
                        </p>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}


'use client';

import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Updated City type to match SignupPageContent.tsx
type City = {
    id: string;
    name: string;
    name_en: string;
    name_municipality: string;
    name_municipality_en: string;
    logoImage: string | null;
    timezone: string;
    createdAt?: Date;
    updatedAt?: Date;
    officialSupport: boolean;
    isListed?: boolean;
    isPending?: boolean;
    authorityType?: string;
    wikipediaId?: string | null;
    geometry?: any;
    supportsNotifications: boolean;
};

enum SignupStage {
    SELECT_MUNICIPALITY = 0,
    LOCATION_TOPIC_SELECTION = 1,
    UNSUPPORTED_MUNICIPALITY = 2,
    USER_REGISTRATION = 3,
    COMPLETE = 4,
}

interface SignupHeaderProps {
    city: City | null;
    stage: SignupStage;
    onBack: () => void;
}

export function SignupHeader({ city, stage, onBack }: SignupHeaderProps) {
    // Get appropriate title based on current stage
    const getTitle = () => {
        switch (stage) {
            case SignupStage.SELECT_MUNICIPALITY:
                return "Επιλέξτε δήμο";
            case SignupStage.LOCATION_TOPIC_SELECTION:
                return `${city?.name || 'Δήμος'}: Επιλέξτε τοποθεσίες και θέματα`;
            case SignupStage.UNSUPPORTED_MUNICIPALITY:
                return `${city?.name || 'Δήμος'}: Δεν υποστηρίζει ακόμα ενημερώσεις`;
            case SignupStage.USER_REGISTRATION:
                return "Ολοκληρώστε την εγγραφή σας";
            case SignupStage.COMPLETE:
                return "Η εγγραφή ολοκληρώθηκε";
            default:
                return "Γραφτείτε στις ενημερώσεις";
        }
    };

    // Determine if back button should be shown
    const showBackButton = stage !== SignupStage.SELECT_MUNICIPALITY;

    return (
        <div className="p-4 flex items-center bg-black/10 backdrop-blur-md">
            {showBackButton && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onBack}
                    className="mr-4 text-black"
                >
                    <ArrowLeft size={20} />
                </Button>
            )}

            <div>
                <h1 className="text-xl font-bold text-black">{getTitle()}</h1>
                {city && stage !== SignupStage.COMPLETE && (
                    <div className="flex items-center">
                        {city.name && (
                            <span className="text-sm opacity-80">{city.name}</span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
} 
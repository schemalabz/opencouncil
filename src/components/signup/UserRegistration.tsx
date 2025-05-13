'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin, Tag, Mail, Phone, AlertCircle, UserCheck, Home } from 'lucide-react';
import { useSession } from 'next-auth/react';

// Updated types to match SignupPageContent.tsx
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

type Location = {
    id: string;
    text: string;
    coordinates: [number, number];
};

type Topic = {
    id: string;
    name: string;
    name_en: string;
    colorHex: string;
    icon?: string;
    createdAt?: Date;
    updatedAt?: Date;
};

type PetitionData = {
    name: string;
    isResident: boolean;
    isCitizen: boolean;
};

interface UserRegistrationProps {
    city: City | null;
    petitionData: PetitionData | null;
    locations: Location[];
    topics: Topic[];
    onSubmit: (email: string, phone?: string) => void;
}

export function UserRegistration({
    city,
    petitionData,
    locations,
    topics,
    onSubmit
}: UserRegistrationProps) {
    const { data: session } = useSession();
    const [email, setEmail] = useState(session?.user?.email || '');
    const [phone, setPhone] = useState('');
    const [emailError, setEmailError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Validate email
        if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setEmailError('Παρακαλώ εισάγετε ένα έγκυρο email');
            return;
        }

        setEmailError(null);
        setIsSubmitting(true);

        // Submit the form
        onSubmit(email, phone || undefined);
    };

    // Determine whether this is for a petition or notification preferences
    const isPetition = petitionData !== null && petitionData !== undefined;

    return (
        <div className="p-6 bg-white/80 backdrop-blur-sm rounded-lg shadow-md w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Ολοκληρώστε την εγγραφή σας</h2>

            <div className="mb-6">
                <h3 className="text-sm font-medium mb-2">Σύνοψη επιλογών</h3>
                {city && (
                    <div className="flex items-start gap-2 mb-2">
                        <div className="mt-0.5 text-gray-500">
                            <MapPin className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="font-medium">{city.name}</p>
                        </div>
                    </div>
                )}

                {isPetition && petitionData && (
                    <div className="flex items-start gap-2 mb-2">
                        <div className="mt-0.5 text-gray-500">
                            <UserCheck className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="font-medium">Στοιχεία αιτήματος</p>
                            <p className="text-sm text-gray-700">Όνομα: {petitionData.name}</p>
                            <div className="flex flex-wrap gap-2 mt-1">
                                {petitionData.isResident && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800">
                                        <Home className="h-3 w-3 mr-1" />
                                        Κάτοικος
                                    </span>
                                )}
                                {petitionData.isCitizen && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800">
                                        <UserCheck className="h-3 w-3 mr-1" />
                                        Δημότης
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {!isPetition && locations.length > 0 && (
                    <div className="flex items-start gap-2 mb-2">
                        <div className="mt-0.5 text-gray-500">
                            <MapPin className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="font-medium">Τοποθεσίες</p>
                            <ul className="text-sm text-gray-700">
                                {locations.map(location => (
                                    <li key={location.id}>{location.text}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}

                {!isPetition && topics.length > 0 && (
                    <div className="flex items-start gap-2">
                        <div className="mt-0.5 text-gray-500">
                            <Tag className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="font-medium">Θέματα</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                                {topics.map(topic => (
                                    <span
                                        key={topic.id}
                                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                                        style={{
                                            backgroundColor: `${topic.colorHex}20`,
                                            color: topic.colorHex
                                        }}
                                    >
                                        {topic.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="email" className="flex items-center gap-1">
                        <Mail className="h-4 w-4" />
                        <span>Email</span>
                    </Label>
                    <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Το email σας"
                        disabled={!!session?.user?.email}
                    />
                    {emailError && (
                        <div className="flex items-center gap-1 text-red-500 text-sm">
                            <AlertCircle className="h-3 w-3" />
                            <p>{emailError}</p>
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="phone" className="flex items-center gap-1">
                        <Phone className="h-4 w-4" />
                        <span>Τηλέφωνο (προαιρετικό)</span>
                    </Label>
                    <Input
                        id="phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Το τηλέφωνό σας"
                    />
                </div>

                <div className="pt-2">
                    <Button
                        type="submit"
                        className="w-full"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? 'Υποβολή...' : 'Ολοκλήρωση εγγραφής'}
                    </Button>
                </div>
            </form>
        </div>
    );
} 
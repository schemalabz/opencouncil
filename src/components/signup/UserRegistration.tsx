'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin, Tag, Mail, Phone, AlertCircle, UserCheck, Home, User } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { PhoneInput } from 'react-international-phone';
import 'react-international-phone/style.css';
import { City, AppTopic, PetitionData, Location } from './SignupPageContent';

interface UserRegistrationProps {
    city: City | null;
    petitionData: PetitionData | null;
    locations: Location[];
    topics: AppTopic[];
    onSubmit: (email: string, phone?: string, name?: string) => void;
}

export function UserRegistration({
    city,
    petitionData,
    locations,
    topics,
    onSubmit
}: UserRegistrationProps) {
    const { data: session } = useSession();
    const [name, setName] = useState('');
    const [email, setEmail] = useState(session?.user?.email || '');
    const [phone, setPhone] = useState('');
    const [nameError, setNameError] = useState<string | null>(null);
    const [emailError, setEmailError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        let isValid = true;

        // Validate email
        if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setEmailError('Παρακαλώ εισάγετε ένα έγκυρο email');
            isValid = false;
        } else {
            setEmailError(null);
        }

        // Validate name if petitionData is null (not a petition)
        if (!petitionData && !name.trim()) {
            setNameError('Παρακαλώ συμπληρώστε το ονοματεπώνυμό σας');
            isValid = false;
        } else {
            setNameError(null);
        }

        if (!isValid) return;

        setIsSubmitting(true);

        // Submit the form with the name parameter only if it's not a petition
        if (petitionData) {
            onSubmit(email, phone || undefined);
        } else {
            onSubmit(email, phone || undefined, name);
        }
    };

    // Determine whether this is for a petition or notification preferences
    const isPetition = petitionData !== null && petitionData !== undefined;

    return (
        <div className="w-full max-w-md">
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
                {/* Only show name field when not a petition */}
                {!isPetition && (
                    <div className="space-y-2">
                        <Label htmlFor="name" className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            <span>Ονοματεπώνυμο</span>
                        </Label>
                        <Input
                            id="name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Το ονοματεπώνυμό σας"
                        />
                        {nameError && (
                            <div className="flex items-center gap-1 text-red-500 text-sm">
                                <AlertCircle className="h-3 w-3" />
                                <p>{nameError}</p>
                            </div>
                        )}
                    </div>
                )}

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
                    <div className="phone-input-container relative">
                        <PhoneInput
                            defaultCountry="gr"
                            value={phone}
                            onChange={(value) => setPhone(value)}
                            inputClassName="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Το τηλέφωνό σας"
                        />
                    </div>
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
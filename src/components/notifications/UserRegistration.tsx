'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin, Tag, Mail, Phone, AlertCircle, UserCheck, Home, User, Lock, LogIn, Info } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { PhoneInput } from 'react-international-phone';
import 'react-international-phone/style.css';
import { AppTopic, PetitionData, Location } from './SignupPageContent';
import { useRouter } from 'next/navigation';
import { signInWithEmail } from "@/lib/serverSignIn";
import { CityWithGeometry } from '@/lib/db/cities';

// Function to check if email exists in the database
async function checkEmailExists(email: string): Promise<boolean> {
    try {
        const response = await fetch(`/api/auth/check-email?email=${encodeURIComponent(email)}`);
        if (!response.ok) throw new Error('Failed to check email');
        const data = await response.json();
        return data.exists;
    } catch (error) {
        console.error('Error checking email:', error);
        return false; // Assume email doesn't exist if check fails
    }
}

interface UserRegistrationProps {
    city: CityWithGeometry | null;
    petitionData: PetitionData | null;
    locations: Location[];
    topics: AppTopic[];
    onSubmit: (email: string, phone?: string, name?: string) => void;
    emailError?: boolean;
}

export function UserRegistration({
    city,
    petitionData,
    locations,
    topics,
    onSubmit,
    emailError = false
}: UserRegistrationProps) {
    const { data: session, status: sessionStatus } = useSession();
    const router = useRouter();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [nameError, setNameError] = useState<string | null>(null);
    const [localEmailError, setLocalEmailError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [emailExists, setEmailExists] = useState(false);
    const [submittedWithExistingEmail, setSubmittedWithExistingEmail] = useState(false);
    const [signingIn, setSigningIn] = useState(false);
    const [signInError, setSignInError] = useState<string | null>(null);

    // Check if the user is logged in
    const isLoggedIn = sessionStatus === 'authenticated' && !!session?.user;

    // Initialize and update form values when session changes
    useEffect(() => {
        if (session?.user) {
            if (session.user.email) setEmail(session.user.email);
            if (session.user.name) setName(session.user.name);
        }
    }, [session, sessionStatus]);

    // Handle email change and check if it exists
    const handleEmailChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const newEmail = e.target.value;
        setEmail(newEmail);

        // Reset email error and exists status when email changes
        setLocalEmailError(null);
        setEmailExists(false);
        setSubmittedWithExistingEmail(false);

        // Skip email check if emailError prop is true (account already exists error from parent)
        if (emailError) return;

        // If email is valid format, check if it exists
        if (newEmail.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
            const exists = await checkEmailExists(newEmail);
            setEmailExists(exists);
            if (exists) {
                // Clear message about sending confirmation email and just indicate account exists
                setLocalEmailError('Αυτός ο λογαριασμός υπάρχει ήδη. Παρακαλώ συνδεθείτε.');
            }
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // If emailError prop is true, don't allow submission
        if (emailError) return;

        let isValid = true;

        // Validate email only if not logged in (email field is disabled for logged-in users)
        if (!isLoggedIn && (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
            setLocalEmailError('Παρακαλώ εισάγετε ένα έγκυρο email');
            isValid = false;
        } else {
            // If email exists, we allow submission but keep the informational message
            // Don't set emailError to null to keep the informational message
            if (!emailExists) {
                setLocalEmailError(null);
            }
        }

        // Validate name only for non-petition forms and when user doesn't have a name in session
        if (!petitionData && !name.trim() && !session?.user?.name) {
            setNameError('Παρακαλώ συμπληρώστε το ονοματεπώνυμό σας');
            isValid = false;
        } else {
            setNameError(null);
        }

        if (!isValid) return;

        setIsSubmitting(true);

        // Track if we submitted with an existing email for messaging
        if (emailExists) {
            setSubmittedWithExistingEmail(true);
        }

        // Submit the form
        if (petitionData) {
            onSubmit(email, phone || undefined);
        } else {
            onSubmit(email, phone || undefined, name);
        }
    };

    // Updated handle login function to use signInWithEmail directly
    const handleLoginRedirect = async () => {
        if (!email || signingIn) return;

        setSigningIn(true);
        setSignInError(null);

        try {
            // Create FormData and append email
            const formData = new FormData();
            formData.append('email', email);

            // Call server function to send sign-in email
            await signInWithEmail(formData);

            // Show message that email was sent
            setSubmittedWithExistingEmail(true);
        } catch (error) {
            console.error('Error signing in:', error);
            setSignInError('Υπήρξε πρόβλημα κατά την αποστολή του email. Παρακαλώ δοκιμάστε ξανά αργότερα.');
        } finally {
            setSigningIn(false);
        }
    };

    // Determine whether this is for a petition or notification preferences
    const isPetition = petitionData !== null && petitionData !== undefined;

    return (
        <div className="w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Ολοκληρώστε την εγγραφή σας</h2>

            {submittedWithExistingEmail && (
                <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-md flex items-start gap-2">
                    <Info className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold">Έχει σταλεί email σύνδεσης</p>
                        <p className="text-sm">Παρακαλώ ελέγξτε το email σας και ακολουθήστε τον σύνδεσμο για να συνδεθείτε.</p>
                    </div>
                </div>
            )}

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
                            {isLoggedIn && session?.user?.name && (
                                <Lock className="h-3 w-3 text-gray-400 ml-1" />
                            )}
                        </Label>
                        <div className="relative">
                            <Input
                                id="name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Το ονοματεπώνυμό σας"
                                disabled={isLoggedIn && !!session?.user?.name}
                                className={isLoggedIn && !!session?.user?.name ?
                                    "bg-gray-100 text-gray-700 cursor-not-allowed" : ""}
                                readOnly={isLoggedIn && !!session?.user?.name}
                            />
                        </div>
                        {isLoggedIn && session?.user?.name && (
                            <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                                <span>Χρησιμοποιείται το όνομα από τον λογαριασμό σας</span>
                            </div>
                        )}
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
                        {isLoggedIn && (
                            <Lock className="h-3 w-3 text-gray-400 ml-1" />
                        )}
                    </Label>
                    <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={handleEmailChange}
                        placeholder="Το email σας"
                        disabled={isLoggedIn}
                        readOnly={isLoggedIn}
                        className={isLoggedIn ? "bg-gray-100 text-gray-700 cursor-not-allowed" : ""}
                    />
                    {isLoggedIn && (
                        <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                            <span>Χρησιμοποιείται το email από τον λογαριασμό σας</span>
                        </div>
                    )}
                    {localEmailError && (
                        <div className={`flex flex-col gap-2 ${emailExists ? 'text-blue-600' : 'text-red-500'} text-sm`}>
                            <div className="flex items-center gap-1">
                                {emailExists ? (
                                    <Info className="h-3 w-3 flex-shrink-0" />
                                ) : (
                                    <AlertCircle className="h-3 w-3 flex-shrink-0" />
                                )}
                                <p>{localEmailError}</p>
                            </div>
                            {emailExists && (
                                <div className="flex flex-col items-center w-full mt-2">
                                    <Button
                                        type="button"
                                        variant="default"
                                        size="sm"
                                        className="flex items-center gap-1 w-full"
                                        onClick={handleLoginRedirect}
                                        disabled={signingIn}
                                    >
                                        <LogIn className="h-3 w-3" />
                                        <span>{signingIn ? "Αποστολή συνδέσμου..." : "Συνέχεια με Email"}</span>
                                    </Button>

                                    {signInError && (
                                        <p className="text-red-500 text-xs mt-2">{signInError}</p>
                                    )}
                                </div>
                            )}
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
                        disabled={isSubmitting || emailError || !!localEmailError}
                    >
                        {isSubmitting ? 'Υποβολή...' : 'Ολοκλήρωση εγγραφής'}
                    </Button>
                </div>
            </form>
        </div>
    );
} 
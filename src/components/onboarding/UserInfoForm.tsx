import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from 'react-international-phone';
import 'react-international-phone/style.css';
import { useSession } from 'next-auth/react';
import { User, Mail, Phone, Lock, AlertCircle } from 'lucide-react';

export interface UserInfoFormData {
    name: string;
    email?: string;
    phone?: string;
}

interface UserInfoFormProps {
    onSubmit: (data: UserInfoFormData) => void;
    initialData?: UserInfoFormData;
    isSubmitting?: boolean;
    showName?: boolean;
    showEmail?: boolean;
    showPhone?: boolean;
    requireName?: boolean;
    requireEmail?: boolean;
    requirePhone?: boolean;
}

export function UserInfoForm({
    onSubmit,
    initialData,
    isSubmitting = false,
    showName = true,
    showEmail = true,
    showPhone = true,
    requireName = true,
    requireEmail = true,
    requirePhone = false,
}: UserInfoFormProps) {
    const { data: session, status: sessionStatus } = useSession();
    const [name, setName] = useState(initialData?.name || '');
    const [email, setEmail] = useState(initialData?.email || '');
    const [phone, setPhone] = useState(initialData?.phone || '');
    const [nameError, setNameError] = useState<string | null>(null);
    const [emailError, setEmailError] = useState<string | null>(null);
    const [phoneError, setPhoneError] = useState<string | null>(null);

    // Check if the user is logged in
    const isLoggedIn = sessionStatus === 'authenticated' && !!session?.user;

    // Initialize and update form values when session changes
    useEffect(() => {
        if (session?.user && !isSubmitting) {
            if (session.user.email) setEmail(session.user.email);
            if (session.user.name) setName(session.user.name);
            if (session.user.phone) setPhone(session.user.phone);
        }
    }, [session, sessionStatus, isSubmitting]);

    useEffect(() => {
        if (initialData && !isSubmitting) {
            if (initialData.name) setName(initialData.name);
            if (initialData.email) setEmail(initialData.email);
            if (initialData.phone) setPhone(initialData.phone);
        }
    }, [initialData, isSubmitting]);

    const validateEmail = (email: string) => {
        return /.+@.+\..+/.test(email);
    };

    const validatePhone = (phone: string) => {
        // If phone is empty or only contains the +30 prefix, return true
        if (!phone || phone === '+30') return true;
        
        // Remove any non-digit characters and the +30 prefix for validation
        const digitsOnly = phone.replace(/\D/g, '');
        // Remove the +30 prefix if it exists (first 2 digits)
        const numberWithoutPrefix = digitsOnly.startsWith('30') ? digitsOnly.slice(2) : digitsOnly;
        // Greek phone numbers should be 10 digits (without the country code)
        return numberWithoutPrefix.length === 10;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        let valid = true;

        if (showName && requireName && !name.trim()) {
            setNameError('Παρακαλώ συμπληρώστε το ονοματεπώνυμό σας');
            valid = false;
        } else {
            setNameError(null);
        }

        if (showEmail && requireEmail && (!email.trim() || !validateEmail(email))) {
            setEmailError('Παρακαλώ εισάγετε ένα έγκυρο email');
            valid = false;
        } else {
            setEmailError(null);
        }

        if (showPhone && (!validatePhone(phone))) {
            setPhoneError('Παρακαλώ εισάγετε ένα έγκυρο τηλέφωνο (10 ψηφία)');
            valid = false;
        } else {
            setPhoneError(null);
        }

        if (valid) {
            onSubmit({
                name: name.trim(),
                email: email.trim(),
                phone: phone.trim() || undefined
            });
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {showName && (
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
                            placeholder="Εισάγετε το ονοματεπώνυμό σας"
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

            {showEmail && (
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
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Εισάγετε το email σας"
                        disabled={isLoggedIn}
                        readOnly={isLoggedIn}
                        className={isLoggedIn ? "bg-gray-100 text-gray-700 cursor-not-allowed" : ""}
                    />
                    {isLoggedIn && (
                        <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                            <span>Χρησιμοποιείται το email από τον λογαριασμό σας</span>
                        </div>
                    )}
                    {emailError && (
                        <div className="flex items-center gap-1 text-red-500 text-sm">
                            <AlertCircle className="h-3 w-3" />
                            <p>{emailError}</p>
                        </div>
                    )}
                </div>
            )}

            {showPhone && (
                <div className="space-y-2">
                    <Label htmlFor="phone" className="flex items-center gap-1">
                        <Phone className="h-4 w-4" />
                        <span>Τηλέφωνο {!requirePhone && '(προαιρετικό)'}</span>
                    </Label>
                    <div className="phone-input-container relative">
                        <PhoneInput
                            defaultCountry="gr"
                            hideDropdown={true}
                            value={phone}
                            onChange={(value) => setPhone(value)}
                            inputClassName="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Το τηλέφωνό σας"
                        />
                    </div>
                    {phoneError && (
                        <div className="flex items-center gap-1 text-red-500 text-sm">
                            <AlertCircle className="h-3 w-3" />
                            <p>{phoneError}</p>
                        </div>
                    )}
                </div>
            )}
        </form>
    );
} 
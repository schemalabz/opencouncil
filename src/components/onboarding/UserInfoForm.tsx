import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneField, PhoneFieldValidity } from '@/components/ui/phone-field';
import { useSession } from 'next-auth/react';
import { User, Mail, Phone, Lock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

export interface UserInfoFormData {
    name: string;
    email?: string;
    phone?: string;
}

// Module-level so the reference is stable across renders (no exhaustive-deps
// churn when used inside effects). Pure: depends only on its argument.
const validateEmail = (email: string) => /.+@.+\..+/.test(email);

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
    const t = useTranslations('Onboarding.form');
    const [name, setName] = useState(initialData?.name || '');
    const [email, setEmail] = useState(initialData?.email || '');
    const [phone, setPhone] = useState(initialData?.phone || '');
    const [phoneValidity, setPhoneValidity] = useState<PhoneFieldValidity>({
        isActive: false,
        isEmpty: true,
        isValid: false,
    });
    const [nameError, setNameError] = useState<string | null>(null);
    const [emailError, setEmailError] = useState<string | null>(null);

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

    // The name field is locked (read-only) when prefilled from the session.
    const nameLocked = isLoggedIn && !!session?.user?.name;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        let valid = true;

        if (showName && requireName && !name.trim()) {
            setNameError(t('nameError'));
            valid = false;
        } else {
            setNameError(null);
        }

        if (showEmail && requireEmail && (!email.trim() || !validateEmail(email))) {
            setEmailError(t('emailError'));
            valid = false;
        } else {
            setEmailError(null);
        }

        if (showPhone && phoneValidity.isActive && !phoneValidity.isEmpty && !phoneValidity.isValid) {
            valid = false;
        }

        if (valid) {
            onSubmit({
                name: name.trim(),
                email: email.trim(),
                phone: phoneValidity.isActive && !phoneValidity.isEmpty ? phone : undefined
            });
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {showName && (
                <div className="space-y-2">
                    <Label htmlFor="name" className="flex items-center gap-1">
                        <User className="h-4 w-4" />
                        <span>{t('nameLabel')}</span>
                        {isLoggedIn && session?.user?.name && (
                            <Lock className="h-3 w-3 text-gray-400 ml-1" />
                        )}
                    </Label>
                    <div className="relative">
                        <Input
                            id="name"
                            type="text"
                            autoComplete="name"
                            inputMode="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t('namePlaceholder')}
                            disabled={nameLocked}
                            className={cn(
                                "text-base md:text-sm",
                                nameLocked ? "bg-gray-100 text-gray-700 cursor-not-allowed" : ""
                            )}
                            readOnly={nameLocked}
                        />
                    </div>
                    {isLoggedIn && session?.user?.name && (
                        <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                            <span>{t('nameFromAccount')}</span>
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
                        autoComplete="email"
                        inputMode="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={t('emailPlaceholder')}
                        disabled={isLoggedIn}
                        readOnly={isLoggedIn}
                        className={cn(
                            "text-base md:text-sm",
                            isLoggedIn ? "bg-gray-100 text-gray-700 cursor-not-allowed" : ""
                        )}
                    />
                    {isLoggedIn && (
                        <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                            <span>{t('emailFromAccount')}</span>
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
                        <span>{t('phoneLabel')} {!requirePhone && t('phoneOptional')}</span>
                    </Label>
                    <PhoneField
                        value={phone}
                        onChange={setPhone}
                        onValidityChange={setPhoneValidity}
                        placeholder={t('phonePlaceholder')}
                        activePlaceholder={t('phoneActivePlaceholder')}
                        invalidMessage={t('phoneInvalid')}
                    />
                </div>
            )}
        </form>
    );
} 
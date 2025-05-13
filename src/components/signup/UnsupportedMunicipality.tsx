'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

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

interface UnsupportedMunicipalityProps {
    city: City;
    onSubmit: (data: { name: string; isResident: boolean; isCitizen: boolean }) => void;
}

export function UnsupportedMunicipality({ city, onSubmit }: UnsupportedMunicipalityProps) {
    const [name, setName] = useState('');
    const [isResident, setIsResident] = useState(false);
    const [isCitizen, setIsCitizen] = useState(false);
    const [nameError, setNameError] = useState<string | null>(null);
    const [checkboxError, setCheckboxError] = useState<string | null>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Validate form
        let valid = true;

        if (!name.trim()) {
            setNameError('Παρακαλώ συμπληρώστε το ονοματεπώνυμό σας');
            valid = false;
        } else {
            setNameError(null);
        }

        if (!isResident && !isCitizen) {
            setCheckboxError('Παρακαλώ επιλέξτε τουλάχιστον μία σχέση με τον δήμο');
            valid = false;
        } else {
            setCheckboxError(null);
        }

        if (valid) {
            onSubmit({
                name: name.trim(),
                isResident,
                isCitizen
            });
        }
    };

    return (
        <div className="p-6 bg-white/80 backdrop-blur-sm rounded-lg shadow-md w-full max-w-md">
            {city.officialSupport ? (
                <div className="text-center mb-6">
                    <h2 className="text-xl font-bold mb-4">Ο δήμος {city.name} δεν υποστηρίζει ακόμα ενημερώσεις</h2>
                    <p className="text-gray-700">
                        Ο δήμος {city.name} είναι στο δίκτυο του OpenCouncil, αλλά δεν έχει ενεργοποιήσει ακόμη τις ενημερώσεις για τους δημότες.
                    </p>
                </div>
            ) : (
                <div className="text-center mb-6">
                    <h2 className="text-xl font-bold mb-4">Ο δήμος {city.name} δεν είναι ακόμα στο δίκτυο OpenCouncil</h2>
                    <p className="text-gray-700">
                        Βοηθήστε μας να φέρουμε τον δήμο σας στο δίκτυο του OpenCouncil συμπληρώνοντας την παρακάτω φόρμα.
                    </p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="name">Ονοματεπώνυμο</Label>
                    <Input
                        id="name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Εισάγετε το ονοματεπώνυμό σας"
                    />
                    {nameError && <p className="text-red-500 text-sm">{nameError}</p>}
                </div>

                <div className="space-y-2">
                    <p className="text-sm font-medium">Σχέση με τον δήμο</p>

                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="isResident"
                            checked={isResident}
                            onCheckedChange={(checked) => setIsResident(checked === true)}
                        />
                        <Label htmlFor="isResident" className="text-sm">Είμαι κάτοικος</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="isCitizen"
                            checked={isCitizen}
                            onCheckedChange={(checked) => setIsCitizen(checked === true)}
                        />
                        <Label htmlFor="isCitizen" className="text-sm">Είμαι δημότης</Label>
                    </div>

                    {checkboxError && <p className="text-red-500 text-sm">{checkboxError}</p>}
                </div>

                <Button type="submit" className="w-full">
                    Υποβολή αιτήματος
                </Button>
            </form>
        </div>
    );
} 
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { PetitionData } from './SignupPageContent';
import { CityWithGeometry } from '@/lib/db/cities';

interface UnsupportedMunicipalityProps {
    city: CityWithGeometry;
    onSubmit: (data: PetitionData) => void;
    initialData?: PetitionData;
}

export function UnsupportedMunicipality({
    city,
    onSubmit,
    initialData
}: UnsupportedMunicipalityProps) {
    const [name, setName] = useState(initialData?.name || '');
    const [isResident, setIsResident] = useState(initialData?.isResident || false);
    const [isCitizen, setIsCitizen] = useState(initialData?.isCitizen || false);
    const [nameError, setNameError] = useState<string | null>(null);
    const [checkboxError, setCheckboxError] = useState<string | null>(null);

    // Update form when initialData changes
    useEffect(() => {
        if (initialData) {
            setName(initialData.name);
            setIsResident(initialData.isResident);
            setIsCitizen(initialData.isCitizen);
        }
    }, [initialData]);

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

    const isUpdate = !!initialData;

    return (
        <div className="w-full max-w-md">
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
                    <p className="text-gray-700 text-left">
                        Μπορείτε να μας βοηθήσετε να φέρουμε το δήμο σας στο OpenCouncil, επιτρέποντας μας να χρησιμοποιήσουμε το
                        όνομά σας όταν μιλήσουμε με το δήμο, ως δημότης που θα ήθελε να έχει το OpenCouncil στο δήμο του.
                    </p>
                    <p className="text-gray-700 mt-2 text-left">
                        Έχουμε εμπορική δραστηριότητα με τους δήμους που συνεργαζόμαστε, και ο τρόπος που τιμολογούμε και οι τιμές
                        μας είναι δημόσια διαθέσιμες στο <a href="https://opencouncil.gr/about" className="text-blue-500">opencouncil.gr/about</a>.
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
                    {isUpdate ? 'Ενημέρωση αιτήματος' : 'Υποβολή αιτήματος'}
                </Button>
            </form>
        </div>
    );
} 
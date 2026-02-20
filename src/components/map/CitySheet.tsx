'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
    Building2,
    Calendar,
    X,
    BadgeCheck,
    BadgeX,
    Bell,
    CheckCircle2
} from 'lucide-react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface CitySheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    cityName: string;
    cityId: string;
    logoImage?: string;
    meetingsCount: number;
    officialSupport: boolean;
    supportsNotifications: boolean;
}

type PetitionStep = 'info' | 'form' | 'registration' | 'success';

const petitionSteps: PetitionStep[] = ['info', 'form', 'registration', 'success'];
const getPetitionStepIndex = (step: PetitionStep) => petitionSteps.indexOf(step);

export function CitySheet({
    open,
    onOpenChange,
    cityName,
    cityId,
    logoImage,
    meetingsCount,
    officialSupport,
    supportsNotifications
}: CitySheetProps) {
    const router = useRouter();

    // Petition form state
    const [petitionStep, setPetitionStep] = useState<PetitionStep>('info');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [isResident, setIsResident] = useState(false);
    const [isCitizen, setIsCitizen] = useState(false);

    const handleClose = () => {
        onOpenChange(false);
        // Reset petition form after closing
        setTimeout(() => {
            setPetitionStep('info');
            setName('');
            setEmail('');
            setPhone('');
            setIsResident(false);
            setIsCitizen(false);
            setError(null);
        }, 300);
    };

    const handleViewCity = () => {
        router.push(`/${cityId}`);
    };

    const handlePetitionStart = () => {
        setPetitionStep('form');
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            setError('Παρακαλώ συμπληρώστε το όνομά σας');
            return;
        }
        if (!isResident && !isCitizen) {
            setError('Παρακαλώ επιλέξτε τουλάχιστον μία σχέση με τον δήμο');
            return;
        }
        setError(null);
        setPetitionStep('registration');
    };

    const handleRegistrationSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) {
            setError('Παρακαλώ συμπληρώστε το email σας');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const response = await fetch('/api/petitions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cityId,
                    name: name.trim(),
                    email: email.trim(),
                    phone: phone.trim() || null,
                    isResident,
                    isCitizen
                })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Σφάλμα κατά την υποβολή');
            }

            setPetitionStep('success');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Σφάλμα κατά την υποβολή');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Step indicator component (matches OnboardingFooter style)
    const PetitionStepIndicator = ({ currentStep }: { currentStep: PetitionStep }) => {
        const currentIndex = getPetitionStepIndex(currentStep);
        const totalSteps = petitionSteps.length;

        return (
            <div className="flex flex-row items-center justify-center gap-2 py-4">
                {Array.from({ length: totalSteps }).map((_, idx) => (
                    <span
                        key={idx}
                        className={cn(
                            'h-2 rounded-full transition-all duration-300',
                            idx === currentIndex
                                ? 'bg-primary w-8 shadow-lg'
                                : idx < currentIndex
                                    ? 'bg-primary/50 w-6'
                                    : 'bg-muted-foreground/30 w-4'
                        )}
                    />
                ))}
            </div>
        );
    };

    const renderContent = () => {
        // Show petition form for unsupported cities
        if (!officialSupport) {
            if (petitionStep === 'form') {
                return (
                    <>
                        <PetitionStepIndicator currentStep={petitionStep} />
                        <form onSubmit={handleFormSubmit} className="space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Ονοματεπώνυμο *</Label>
                                    <Input
                                        id="name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Το ονοματεπώνυμό σας"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <p className="text-sm font-medium">Σχέση με τον δήμο *</p>
                                    <div className="flex items-center space-x-2">
                                        <Checkbox
                                            id="isResident"
                                            checked={isResident}
                                            onCheckedChange={(checked) => setIsResident(checked === true)}
                                        />
                                        <Label htmlFor="isResident" className="text-sm font-normal">Είμαι κάτοικος</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Checkbox
                                            id="isCitizen"
                                            checked={isCitizen}
                                            onCheckedChange={(checked) => setIsCitizen(checked === true)}
                                        />
                                        <Label htmlFor="isCitizen" className="text-sm font-normal">Είμαι δημότης</Label>
                                    </div>
                                </div>
                            </div>

                            {error && (
                                <p className="text-sm text-destructive">{error}</p>
                            )}

                            <div className="flex gap-3">
                                <Button type="button" variant="outline" onClick={() => setPetitionStep('info')} className="flex-1">
                                    Πίσω
                                </Button>
                                <Button type="submit" className="flex-1">
                                    Συνέχεια
                                </Button>
                            </div>
                        </form>
                    </>
                );
            }

            if (petitionStep === 'registration') {
                return (
                    <>
                        <PetitionStepIndicator currentStep={petitionStep} />
                        <form onSubmit={handleRegistrationSubmit} className="space-y-6">
                            <div className="space-y-3 p-4 bg-muted rounded-lg">
                                <h3 className="text-sm font-medium">Σύνοψη επιλογών</h3>
                                <div className="space-y-1 text-sm">
                                    <p><strong>Όνομα:</strong> {name}</p>
                                    <p><strong>Κάτοικος:</strong> {isResident ? 'Ναι' : 'Όχι'}</p>
                                    <p><strong>Δημότης:</strong> {isCitizen ? 'Ναι' : 'Όχι'}</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email *</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="your@email.com"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="phone">Τηλέφωνο (προαιρετικό)</Label>
                                    <Input
                                        id="phone"
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="+30 123 456 7890"
                                    />
                                </div>
                            </div>

                            {error && (
                                <p className="text-sm text-destructive">{error}</p>
                            )}

                            <div className="flex gap-3">
                                <Button type="button" variant="outline" onClick={() => setPetitionStep('form')} disabled={isSubmitting} className="flex-1">
                                    Πίσω
                                </Button>
                                <Button type="submit" disabled={isSubmitting} className="flex-1">
                                    {isSubmitting ? 'Υποβολή...' : 'Υποβολή'}
                                </Button>
                            </div>
                        </form>
                    </>
                );
            }

            if (petitionStep === 'success') {
                return (
                    <>
                        <PetitionStepIndicator currentStep={petitionStep} />
                        <div className="space-y-6">
                            <div className="flex flex-col items-center text-center space-y-4 py-8">
                                <CheckCircle2 className="h-16 w-16 text-green-600" />
                                <div className="space-y-2">
                                    <h3 className="text-lg font-semibold">Η υποστήριξή σας καταχωρήθηκε!</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Σας ευχαριστούμε για την υποστήριξή σας! Θα σας ενημερώσουμε όταν ο δήμος ενταχθεί στο δίκτυο OpenCouncil!
                                    </p>
                                </div>
                            </div>

                            <Button onClick={handleClose} className="w-full">
                                Κλείσιμο
                            </Button>
                        </div>
                    </>
                );
            }

            // Default petition info step
            return (
                <>
                    <PetitionStepIndicator currentStep={petitionStep} />
                    <div className="space-y-6">
                        <div className="space-y-4">
                            <p className="text-sm text-foreground">
                                Μπορείτε να μας βοηθήσετε να φέρουμε τον δήμο σας στο OpenCouncil, επιτρέποντας μας να χρησιμοποιήσουμε το
                                όνομά σας όταν μιλήσουμε με τον δήμο, ως δημότη που θα ήθελε να έχει το OpenCouncil στον δήμο του.
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Έχουμε εμπορική δραστηριότητα με τους δήμους που συνεργαζόμαστε. Οι τιμές και ο τρόπος που τιμολογούμε είναι δημόσια διαθέσιμες στο{' '}
                                <a href="https://opencouncil.gr/about" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                                    opencouncil.gr/about
                                </a>.
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <Button variant="outline" onClick={handleClose} className="flex-1">
                                Ακύρωση
                            </Button>
                            <Button onClick={handlePetitionStart} className="flex-1">
                                Συνέχεια
                            </Button>
                        </div>
                    </div>
                </>
            );
        }

        // Content for supported cities
        return (
            <div className="space-y-6">
                {meetingsCount > 0 && (
                    <div className="p-4 bg-muted rounded-lg">
                        <div className="flex items-center gap-2 text-sm">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Συνεδριάσεις:</span>
                            <span className="font-semibold">{meetingsCount}</span>
                        </div>
                    </div>
                )}

                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Δείτε όλες τις συνεδριάσεις, θέματα και πληροφορίες για τον δήμο.
                    </p>

                    <div className="space-y-3">
                        <Button
                            onClick={handleViewCity}
                            size="lg"
                            className="w-full"
                        >
                            <Building2 className="w-4 h-4 mr-2" />
                            Προβολή Δήμου
                        </Button>

                        {supportsNotifications && (
                            <Button
                                onClick={() => router.push(`/${cityId}/notifications`)}
                                variant="outline"
                                size="lg"
                                className="w-full group transition-all duration-300"
                            >
                                <div className="relative z-10 flex items-center gap-2">
                                    <Bell className="w-4 h-4" />
                                    <span>Ενεργοποίηση ειδοποιήσεων</span>
                                </div>
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <Sheet open={open} onOpenChange={handleClose}>
            <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
                <button
                    onClick={handleClose}
                    className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
                >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                </button>

                <SheetHeader className="text-left mb-6">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="relative w-16 h-16 flex-shrink-0">
                            {logoImage ? (
                                <Image
                                    src={logoImage}
                                    alt={`${cityName} logo`}
                                    fill
                                    className="object-contain"
                                />
                            ) : (
                                <Building2 className="w-16 h-16 text-muted-foreground" />
                            )}
                        </div>
                        <div className="space-y-2">
                            <SheetTitle className="text-xl text-left">{cityName}</SheetTitle>
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                            >
                                {officialSupport ? (
                                    <Badge variant="secondary" className="gap-2 bg-green-100/80 text-green-800 hover:bg-green-100">
                                        <BadgeCheck className="w-3 h-3" />
                                        <span>Με την υποστήριξη του δήμου</span>
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="gap-2 text-muted-foreground">
                                        <BadgeX className="w-3 h-3" />
                                        <span>Χωρίς επίσημη υποστήριξη</span>
                                    </Badge>
                                )}
                            </motion.div>
                        </div>
                    </div>
                </SheetHeader>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    {renderContent()}
                </motion.div>
            </SheetContent>
        </Sheet>
    );
}

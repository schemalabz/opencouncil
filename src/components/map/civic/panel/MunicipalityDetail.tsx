"use client"

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { BadgeCheck, BadgeX, Building2, Calendar, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NotificationCTAButton } from '@/components/cities/NotificationCTAButton';
import { cn } from '@/lib/utils';
import { savePetition } from '@/lib/db/notifications';
import type { MapMunicipality } from '@/lib/map/types';

type PetitionStep = 'info' | 'form' | 'registration' | 'success';
const PETITION_STEPS: PetitionStep[] = ['info', 'form', 'registration', 'success'];

interface MunicipalityDetailProps {
    municipality: MapMunicipality | null;
    onOpenChange: (open: boolean) => void;
}

/**
 * Municipality surface: supported cities link onwards; unsupported cities
 * carry the petition flow (submitting via the savePetition server action).
 */
export function MunicipalityDetail({ municipality, onOpenChange }: MunicipalityDetailProps) {
    const t = useTranslations('map.petition');
    const tMap = useTranslations('map');
    const router = useRouter();

    const [step, setStep] = useState<PetitionStep>('info');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [isResident, setIsResident] = useState(false);
    const [isCitizen, setIsCitizen] = useState(false);

    const handleClose = () => {
        onOpenChange(false);
        setTimeout(() => {
            setStep('info');
            setName('');
            setEmail('');
            setPhone('');
            setIsResident(false);
            setIsCitizen(false);
            setError(null);
        }, 300);
    };

    const handleFormContinue = (event: React.FormEvent) => {
        event.preventDefault();
        if (!name.trim()) {
            setError(t('nameRequired'));
            return;
        }
        if (!isResident && !isCitizen) {
            setError(t('relationRequired'));
            return;
        }
        setError(null);
        setStep('registration');
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!municipality) return;
        if (!email.trim()) {
            setError(t('emailRequired'));
            return;
        }
        setIsSubmitting(true);
        setError(null);
        const result = await savePetition({
            cityId: municipality.id,
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim() || undefined,
            isResident,
            isCitizen,
        });
        setIsSubmitting(false);
        if (result.success) {
            setStep('success');
        } else {
            setError(result.error === 'email_exists' ? t('emailExists') : t('submitError'));
        }
    };

    const stepIndicator = (
        <div className="flex flex-row items-center justify-center gap-2 py-4">
            {PETITION_STEPS.map((s, index) => (
                <span
                    key={s}
                    className={cn(
                        'h-2 rounded-full transition-all duration-300',
                        index === PETITION_STEPS.indexOf(step)
                            ? 'w-8 bg-primary'
                            : index < PETITION_STEPS.indexOf(step)
                                ? 'w-6 bg-primary/50'
                                : 'w-4 bg-muted-foreground/30',
                    )}
                />
            ))}
        </div>
    );

    const renderPetitionFlow = () => {
        if (step === 'form') {
            return (
                <form onSubmit={handleFormContinue} className="space-y-6">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="petition-name">{t('nameLabel')}</Label>
                            <Input
                                id="petition-name"
                                value={name}
                                onChange={event => setName(event.target.value)}
                                placeholder={t('namePlaceholder')}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <p className="text-sm font-medium">{t('relationLabel')}</p>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="petition-resident"
                                    checked={isResident}
                                    onCheckedChange={checked => setIsResident(checked === true)}
                                />
                                <Label htmlFor="petition-resident" className="text-sm font-normal">{t('resident')}</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="petition-citizen"
                                    checked={isCitizen}
                                    onCheckedChange={checked => setIsCitizen(checked === true)}
                                />
                                <Label htmlFor="petition-citizen" className="text-sm font-normal">{t('citizen')}</Label>
                            </div>
                        </div>
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <div className="flex gap-3">
                        <Button type="button" variant="outline" onClick={() => setStep('info')} className="flex-1">
                            {t('back')}
                        </Button>
                        <Button type="submit" className="flex-1">{t('continue')}</Button>
                    </div>
                </form>
            );
        }

        if (step === 'registration') {
            return (
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-3 rounded-lg bg-muted p-4">
                        <h3 className="text-sm font-medium">{t('summaryTitle')}</h3>
                        <div className="space-y-1 text-sm">
                            <p><strong>{t('summaryName')}:</strong> {name}</p>
                            <p><strong>{t('summaryResident')}:</strong> {isResident ? t('yes') : t('no')}</p>
                            <p><strong>{t('summaryCitizen')}:</strong> {isCitizen ? t('yes') : t('no')}</p>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="petition-email">{t('emailLabel')}</Label>
                            <Input
                                id="petition-email"
                                type="email"
                                value={email}
                                onChange={event => setEmail(event.target.value)}
                                placeholder="your@email.com"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="petition-phone">{t('phoneLabel')}</Label>
                            <Input
                                id="petition-phone"
                                type="tel"
                                value={phone}
                                onChange={event => setPhone(event.target.value)}
                                placeholder="+30 123 456 7890"
                            />
                        </div>
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <div className="flex gap-3">
                        <Button type="button" variant="outline" onClick={() => setStep('form')} disabled={isSubmitting} className="flex-1">
                            {t('back')}
                        </Button>
                        <Button type="submit" disabled={isSubmitting} className="flex-1">
                            {isSubmitting ? t('submitting') : t('submit')}
                        </Button>
                    </div>
                </form>
            );
        }

        if (step === 'success') {
            return (
                <div className="space-y-6">
                    <div className="flex flex-col items-center space-y-4 py-8 text-center">
                        <CheckCircle2 className="h-16 w-16 text-foreground" />
                        <div className="space-y-2">
                            <h3 className="text-lg font-semibold">{t('successTitle')}</h3>
                            <p className="text-sm text-muted-foreground">{t('successBody')}</p>
                        </div>
                    </div>
                    <Button onClick={handleClose} className="w-full">{t('close')}</Button>
                </div>
            );
        }

        return (
            <div className="space-y-6">
                <div className="space-y-4">
                    <p className="text-sm text-foreground">{t('intro1')}</p>
                    <p className="text-sm text-muted-foreground">
                        {t('intro2')}{' '}
                        <a
                            href="https://opencouncil.gr/about"
                            className="text-[hsl(24,100%,45%)] hover:underline"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            opencouncil.gr/about
                        </a>.
                    </p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" onClick={handleClose} className="flex-1">{t('cancel')}</Button>
                    <Button onClick={() => setStep('form')} className="flex-1">{t('continue')}</Button>
                </div>
            </div>
        );
    };

    return (
        <Sheet open={municipality !== null} onOpenChange={open => { if (!open) handleClose(); }}>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
                {municipality && (
                    <>
                        <SheetHeader className="mb-6 text-left">
                            <div className="mb-2 flex items-center gap-4">
                                <div className="relative h-14 w-14 flex-shrink-0">
                                    {municipality.logoImage ? (
                                        <Image src={municipality.logoImage} alt="" fill sizes="56px" className="object-contain" />
                                    ) : (
                                        <Building2 className="h-14 w-14 text-muted-foreground" />
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <SheetTitle className="text-left text-xl">{municipality.name_municipality}</SheetTitle>
                                    {municipality.officialSupport ? (
                                        <Badge variant="secondary" className="gap-2">
                                            <BadgeCheck className="h-3 w-3" />
                                            <span>{tMap('supportedBadge')}</span>
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="gap-2 text-muted-foreground">
                                            <BadgeX className="h-3 w-3" />
                                            <span>{tMap('noSupportBadge')}</span>
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            {!municipality.officialSupport && stepIndicator}
                        </SheetHeader>

                        {municipality.officialSupport ? (
                            <div className="space-y-6">
                                {municipality.meetingsCount > 0 && (
                                    <div className="rounded-lg bg-muted p-4">
                                        <div className="flex items-center gap-2 text-sm">
                                            <Calendar className="h-4 w-4 text-muted-foreground" />
                                            <span>{tMap('meetingsCount', { count: municipality.meetingsCount })}</span>
                                        </div>
                                    </div>
                                )}
                                <div className="space-y-3">
                                    <Button onClick={() => router.push(`/${municipality.id}`)} size="lg" className="w-full">
                                        <Building2 className="mr-2 h-4 w-4" />
                                        {tMap('viewCity')}
                                    </Button>
                                    {municipality.supportsNotifications && (
                                        <NotificationCTAButton
                                            onClick={() => router.push(`/${municipality.id}/notifications`)}
                                            isSubscribed={false}
                                            fullWidth
                                        />
                                    )}
                                </div>
                            </div>
                        ) : (
                            renderPetitionFlow()
                        )}
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}

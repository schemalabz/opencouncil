'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Link } from '@/i18n/routing';

type Status = 'idle' | 'loading' | 'success-all' | 'success-preferences' | 'error';

interface Props {
    token: string;
    cityName: string;
    userEmail: string;
    allowProductUpdates: boolean;
    allowPetitionUpdates: boolean;
    citySubscribed: boolean;
}

export function UnsubscribeConfirm({
    token,
    cityName,
    userEmail,
    allowProductUpdates,
    allowPetitionUpdates,
    citySubscribed,
}: Props) {
    const t = useTranslations('Unsubscribe');
    const tProfile = useTranslations('Profile');
    const [status, setStatus] = useState<Status>('idle');
    const [citySubscribedState, setCitySubscribedState] = useState(citySubscribed);
    const [productUpdates, setProductUpdates] = useState(allowProductUpdates);
    const [petitionUpdates, setPetitionUpdates] = useState(allowPetitionUpdates);
    const [unsubscribeAll, setUnsubscribeAll] = useState(false);

    const cityChanged = citySubscribed && !citySubscribedState;
    const preferencesChanged =
        productUpdates !== allowProductUpdates ||
        petitionUpdates !== allowPetitionUpdates ||
        cityChanged;
    const canSave = unsubscribeAll || preferencesChanged;

    const displayCity = unsubscribeAll ? false : citySubscribedState;
    const displayProduct = unsubscribeAll ? false : productUpdates;
    const displayPetition = unsubscribeAll ? false : petitionUpdates;

    const handleSave = async () => {
        setStatus('loading');
        try {
            const body: Record<string, unknown> = unsubscribeAll
                ? { token, action: 'all' }
                : {
                    token,
                    action: 'preferences',
                    allowProductUpdates: productUpdates,
                    allowPetitionUpdates: petitionUpdates,
                    ...(cityChanged ? { unsubscribeCity: true } : {}),
                };
            const res = await fetch('/api/unsubscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                setStatus(unsubscribeAll ? 'success-all' : 'success-preferences');
            } else {
                setStatus('error');
            }
        } catch {
            setStatus('error');
        }
    };

    if (status === 'success-all') {
        return (
            <div className="flex flex-col items-center gap-4 text-center">
                <CheckCircle className="h-12 w-12 text-green-500" />
                <h2 className="text-xl font-semibold">{t('successAllTitle')}</h2>
                <p className="text-muted-foreground">{t('successAllDescription')}</p>
                <Button asChild className="mt-2">
                    <Link href="/">{t('returnHomeButton')}</Link>
                </Button>
            </div>
        );
    }

    if (status === 'success-preferences') {
        return (
            <div className="flex flex-col items-center gap-4 text-center">
                <CheckCircle className="h-12 w-12 text-green-500" />
                <h2 className="text-xl font-semibold">{t('successPreferencesTitle')}</h2>
                <p className="text-muted-foreground">{t('successPreferencesDescription')}</p>
                <Button asChild className="mt-2">
                    <Link href="/">{t('returnHomeButton')}</Link>
                </Button>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="flex flex-col items-center gap-4 text-center">
                <XCircle className="h-12 w-12 text-destructive" />
                <h2 className="text-xl font-semibold">{t('errorTitle')}</h2>
                <p className="text-muted-foreground">{t('errorDescription')}</p>
            </div>
        );
    }

    const isLoading = status === 'loading';

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-2 text-center">
                <h2 className="text-xl font-semibold">{t('heading')}</h2>
                {userEmail && (
                    <p className="text-sm text-muted-foreground">
                        {t('accountLabel')}{' '}
                        <span className="font-medium text-foreground">{userEmail}</span>
                    </p>
                )}
            </div>

            <section className="flex flex-col gap-4 border rounded-lg p-5">
                <div className="flex flex-col gap-1">
                    <h3 className="font-semibold">{t('preferencesSectionTitle')}</h3>
                    <p className="text-sm text-muted-foreground">
                        {t('preferencesSectionDescription')}
                    </p>
                </div>

                <div className="flex flex-col gap-4 mb-6">
                    <div className="flex items-start gap-3">
                        <Checkbox
                            id="citySubscribed"
                            checked={displayCity}
                            onCheckedChange={(checked) => setCitySubscribedState(checked === true)}
                            disabled={isLoading || !citySubscribed || unsubscribeAll}
                        />
                        <div className="flex flex-col gap-1 leading-none">
                            <Label htmlFor="citySubscribed">
                                {t('cityCheckboxLabel', { cityName })}
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                {citySubscribed
                                    ? t('cityCheckboxDescription')
                                    : t('cityAlreadyUnsubscribed')}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-3">
                        <Checkbox
                            id="allowProductUpdates"
                            checked={displayProduct}
                            onCheckedChange={(checked) => setProductUpdates(checked === true)}
                            disabled={isLoading || unsubscribeAll}
                        />
                        <div className="flex flex-col gap-1 leading-none">
                            <Label htmlFor="allowProductUpdates">
                                {tProfile('allowProductUpdates')}
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                {tProfile('allowProductUpdatesDescription')}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-3">
                        <Checkbox
                            id="allowPetitionUpdates"
                            checked={displayPetition}
                            onCheckedChange={(checked) => setPetitionUpdates(checked === true)}
                            disabled={isLoading || unsubscribeAll}
                        />
                        <div className="flex flex-col gap-1 leading-none">
                            <Label htmlFor="allowPetitionUpdates">
                                {tProfile('allowPetitionUpdates')}
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                {tProfile('allowPetitionUpdatesDescription')}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 text-muted-foreground text-xs uppercase tracking-wide">
                        <span className="h-px flex-1 bg-border" />
                        <span>{t('or')}</span>
                        <span className="h-px flex-1 bg-border" />
                    </div>

                    <div className="flex items-start gap-3">
                        <Checkbox
                            id="unsubscribeAll"
                            checked={unsubscribeAll}
                            onCheckedChange={(checked) => setUnsubscribeAll(checked === true)}
                            disabled={isLoading}
                        />
                        <div className="flex flex-col gap-1 leading-none">
                            <Label htmlFor="unsubscribeAll">
                                {t('unsubscribeAllCheckboxLabel')}
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                {t('unsubscribeAllCheckboxDescription')}
                            </p>
                        </div>
                    </div>
                </div>

                <Button
                    onClick={handleSave}
                    disabled={isLoading || !canSave}
                    className="w-full h-auto whitespace-normal"
                >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('savePreferencesButton')}
                </Button>
            </section>
        </div>
    );
}

'use client';

import type { CityStatus } from '@prisma/client';
import { CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CityCard, type CityIdentity } from '@/components/signup/CityCard';
import { pickerHref } from '@/components/signup/signup-shared';
import { isCustomer } from '@/lib/cityStatus';

/**
 * The municipality the signup is about, on every step of it.
 *
 * Steps 2 and 3 need it: the picker links straight to step 2, so a reader who
 * taps the wrong row never passes step 1, and step 3 is where the signup
 * saves. Its own heading and copy read the same for every municipality.
 *
 * «Αλλαγή» carries the reader's search back to the picker, asks first when it
 * would discard answers, and stops while a submit is in flight.
 */
export function SignupCityCard({
    city,
    pickerQuery,
    dirty = false,
    submitting = false,
    className,
}: {
    city: CityIdentity & { status: CityStatus };
    /** The search the reader picked this municipality from, if they came that way. */
    pickerQuery: string;
    /** The reader has picked places or topics that leaving would discard. */
    dirty?: boolean;
    submitting?: boolean;
    className?: string;
}) {
    const t = useTranslations('notificationSignup');
    const ts = useTranslations('signup');

    return (
        <CityCard
            city={city}
            className={className}
            changeHref={pickerHref('notifications', pickerQuery)}
            changeLabel={ts('changeCity')}
            changeDisabled={submitting}
            onChangeClick={(event) => {
                // A draft is kept per municipality, and not at all for a reader
                // who is editing, so the answers on these steps do not travel.
                if (dirty && !window.confirm(ts('leaveWarning'))) event.preventDefault();
            }}
            status={
                isCustomer(city.status) ? (
                    <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                        {t('officialSupport')}
                    </>
                ) : undefined
            }
        />
    );
}

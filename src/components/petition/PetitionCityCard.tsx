'use client';

import { useTranslations } from 'next-intl';
import { CityCard, type CityIdentity } from '@/components/signup/CityCard';
import { pickerHref } from '@/components/signup/signup-shared';
import type { PetitionBucket } from '@/lib/landing/petitions';

/**
 * The municipality the petition is about, on every step of it.
 *
 * Step 2 needs it most: the picker links straight there, so a reader who taps
 * the wrong row never passes step 1, and every other string on the step reads
 * the same for every municipality.
 *
 * «Αλλαγή» carries the reader's search back to the picker, so correcting a
 * wrong row does not drop them on the default order and invite the same
 * mistake. It asks first when it would discard answers, and it stops while a
 * submit is in flight.
 */
export function PetitionCityCard({
    city,
    bucket,
    pickerQuery,
    dirty = false,
    submitting = false,
    className,
}: {
    city: CityIdentity;
    /** How many have asked, as the public "N+" bucket; null when too few to say. */
    bucket: PetitionBucket | null;
    /** The search the reader picked this municipality from, if they came that way. */
    pickerQuery: string;
    /** The reader has typed or ticked something that leaving would discard. */
    dirty?: boolean;
    submitting?: boolean;
    className?: string;
}) {
    const t = useTranslations('petition');
    const ts = useTranslations('signup');
    const tc = useTranslations('cityOverview');

    return (
        <CityCard
            city={city}
            className={className}
            changeHref={pickerHref('petition', pickerQuery)}
            changeLabel={ts('changeCity')}
            changeDisabled={submitting}
            onChangeClick={(event) => {
                // A draft is kept per municipality, and not at all for a reader
                // who is updating, so the answers on this step do not travel.
                if (dirty && !window.confirm(ts('leaveWarning'))) event.preventDefault();
            }}
            status={bucket !== null ? tc('petitionCount', { count: bucket }) : t('notInNetwork')}
        />
    );
}

'use client';

import type { Topic } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { TopicFilter } from '@/components/filters/TopicFilter';
import { LocationSelector } from '@/components/onboarding/selectors/LocationSelector';
import { LocationPreview } from '@/components/signup/LocationPreview';
import { MemberNote } from '@/components/signup/MemberNote';
import { Eyebrow, StepHeading } from '@/components/signup/SignupChrome';
import type { CityWithGeometry } from '@/lib/db/cities';
import type { Location } from '@/lib/types/onboarding';
import { SignupCityCard } from './SignupCityCard';

/**
 * Step 2: the places and the topics. Both optional; both editable later.
 * The map is a strip under the search on a phone and a panel beside the
 * column on a desktop (PreferencesAside).
 *
 * The card under the heading names the municipality, because the picker
 * links straight to this step and the copy here is the same for every one
 * of them.
 */
export function PreferencesStep({
    city,
    pickerQuery,
    dirty,
    existing,
    topics,
    locations,
    selectedTopics,
    onLocationsChange,
    onTopicsChange,
}: {
    city: CityWithGeometry;
    /** The search the picker row carried here, so «Αλλαγή» returns to that list. */
    pickerQuery: string;
    /** The reader has picked something that leaving would discard. */
    dirty: boolean;
    /** The reader is already subscribed, so this step edits what they chose. */
    existing: boolean;
    topics: Topic[];
    locations: Location[];
    selectedTopics: Topic[];
    onLocationsChange: (locations: Location[]) => void;
    onTopicsChange: (topics: Topic[]) => void;
}) {
    const t = useTranslations('notificationSignup');
    const ts = useTranslations('signup');

    return (
        <div>
            <StepHeading title={t('preferencesTitle')} lead={t('preferencesLead')} />

            <SignupCityCard city={city} pickerQuery={pickerQuery} dirty={dirty} className="mt-5 lg:mt-7" />

            {existing && <MemberNote title={ts('picker.subscribed')} body={t('alreadySubscribedBody')} className="mt-3.5" />}

            <section className="mt-6 flex flex-col gap-2.5 lg:mt-8">
                <div className="flex items-baseline gap-2">
                    <Eyebrow>{t('locationsEyebrow')}</Eyebrow>
                    <span className="text-xs text-muted-foreground">{t('locationsHint')}</span>
                </div>
                <LocationSelector
                    city={city}
                    selectedLocations={locations}
                    onSelect={(location) => onLocationsChange([...locations, location])}
                    onRemove={(index) => onLocationsChange(locations.filter((_, i) => i !== index))}
                    collapseAfterAdd
                />
                <LocationPreview city={city} locations={locations} className="lg:hidden" />
            </section>

            <section className="mt-6 flex flex-col gap-2.5 lg:mt-8">
                <div className="flex items-baseline gap-2">
                    <Eyebrow>{t('topicsEyebrow')}</Eyebrow>
                    <span className="text-xs text-muted-foreground">{t('topicsHint')}</span>
                </div>
                <TopicFilter topics={topics} selectedTopics={selectedTopics} onChange={onTopicsChange} columns={2} />
            </section>
        </div>
    );
}

/** Beside step 2 on a desktop: the municipality's map, with the places as they are added. */
export function PreferencesAside({ city, locations }: { city: CityWithGeometry; locations: Location[] }) {
    const t = useTranslations('notificationSignup');
    const ts = useTranslations('signup');
    return <LocationPreview city={city} locations={locations} variant="panel" emptyLabel={t('mapEmpty')} />;
}

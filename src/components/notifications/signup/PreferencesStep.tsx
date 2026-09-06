'use client';

import type { Topic } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { TopicFilter } from '@/components/filters/TopicFilter';
import { LocationSelector } from '@/components/onboarding/selectors/LocationSelector';
import type { CityWithGeometry } from '@/lib/db/cities';
import type { Location } from '@/lib/types/onboarding';
import { LocationPreview } from './LocationPreview';
import { Eyebrow, StepHeading } from './SignupChrome';

/**
 * Step 2: the places and the topics. Both optional; both editable later.
 * The map is a strip under the search on a phone and a panel beside the
 * column on a desktop (PreferencesAside).
 */
export function PreferencesStep({
    city,
    topics,
    locations,
    selectedTopics,
    onLocationsChange,
    onTopicsChange,
}: {
    city: CityWithGeometry;
    topics: Topic[];
    locations: Location[];
    selectedTopics: Topic[];
    onLocationsChange: (locations: Location[]) => void;
    onTopicsChange: (topics: Topic[]) => void;
}) {
    const t = useTranslations('notificationSignup');

    return (
        <div>
            <StepHeading title={t('preferencesTitle')} lead={t('preferencesLead')} />

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
    return <LocationPreview city={city} locations={locations} variant="panel" />;
}

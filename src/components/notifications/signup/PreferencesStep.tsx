'use client';

import type { Topic } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { authorityKey } from '@/components/cities/overview/authorityKey';
import { LocationPreview } from '@/components/signup/LocationPreview';
import { MemberNote } from '@/components/signup/MemberNote';
import { StepHeading } from '@/components/signup/SignupChrome';
import type { CityWithGeometry } from '@/lib/db/cities';
import type { Location } from '@/lib/types/onboarding';
import { NearbySubjects } from './NearbySubjects';
import { PlacePicker } from './PlacePicker';
import { SignupCityCard } from './SignupCityCard';
import { TopicHints } from './TopicHints';
import type { NearbyState } from './useNearbySubjects';

/**
 * Step 2: the places, then the topics as hints. Both are optional and both
 * can change later.
 *
 * The places lead because they are what lets Νότης say «1,1 χλμ. από εκεί»:
 * the title asks for them, the search is the largest control, and the map
 * under it is the empty state. A place pays off at once with what the
 * council discussed near it. The topics stay one row until the reader opens
 * them.
 *
 * The municipality is a line above the title, not a card under it. The
 * picker links straight here, so the step still names it, with a way back.
 * On a desktop the map and the nearby subjects move to the aside
 * (PreferencesAside).
 */
export function PreferencesStep({
    city,
    pickerQuery,
    dirty,
    existing,
    topics,
    locations,
    selectedTopics,
    nearby,
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
    /** What the council discussed near the latest place; null while there is none. */
    nearby: NearbyState | null;
    onLocationsChange: (locations: Location[]) => void;
    onTopicsChange: (topics: Topic[]) => void;
}) {
    const t = useTranslations('notificationSignup');
    const ts = useTranslations('signup');

    return (
        <div>
            <SignupCityCard city={city} pickerQuery={pickerQuery} dirty={dirty} variant="line" className="mt-5 lg:mt-7" />

            <StepHeading title={t('preferencesTitle')} lead={t(authorityKey('preferencesLead', city))} className="pt-5 lg:pt-6" />

            {existing && <MemberNote title={ts('picker.subscribed')} body={t('alreadySubscribedBody')} className="mt-3.5" />}

            <PlacePicker
                city={city}
                locations={locations}
                onAdd={(location) => onLocationsChange([...locations, location])}
                onRemove={(index) => onLocationsChange(locations.filter((_, i) => i !== index))}
                className="mt-5 lg:mt-7"
            />
            <LocationPreview city={city} locations={locations} emptyLabel={t('places.mapHint')} className="mt-3 lg:hidden" />
            {nearby && <NearbySubjects state={nearby} timezone={city.timezone} className="mt-3 lg:hidden" />}

            <TopicHints topics={topics} selected={selectedTopics} onChange={onTopicsChange} className="mt-6 lg:mt-8" />
        </div>
    );
}

/** Beside step 2 on a desktop: the municipality's map with the places, and what was discussed near the latest one. */
export function PreferencesAside({
    city,
    locations,
    nearby,
}: {
    city: CityWithGeometry;
    locations: Location[];
    nearby: NearbyState | null;
}) {
    const t = useTranslations('notificationSignup');
    return (
        <div className="flex flex-col gap-3.5">
            <LocationPreview city={city} locations={locations} variant="panel" emptyLabel={t('places.mapHint')} />
            {nearby && <NearbySubjects state={nearby} timezone={city.timezone} />}
        </div>
    );
}

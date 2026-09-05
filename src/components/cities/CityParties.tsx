"use client";
import { useLocale, useTranslations } from 'next-intl';
import List from '@/components/List';
import PartyCard from '@/components/parties/PartyCard';
import PartyForm from '@/components/parties/PartyForm';
import { PartyWithPersons } from '@/lib/db/parties';
import { partyBodyColumns } from '@/lib/party/composition';
import { sortParties } from '@/lib/sorting/parties';
import { Fragment, useCallback, useMemo } from 'react';
import { Person } from '@prisma/client';
import { getLocalizedName } from '@/lib/formatters/name';

type CityPartiesProps = {
    partiesWithPersons: PartyWithPersons[],
    cityId: string,
    canEdit: boolean,
    peopleWithoutParties?: Person[]
};

export default function CityParties({
    partiesWithPersons,
    cityId,
    canEdit,
    peopleWithoutParties
}: CityPartiesProps) {
    const t = useTranslations('Party');
    const locale = useLocale();

    const orderedParties = useMemo(() => sortParties(partiesWithPersons, locale), [partiesWithPersons, locale]);
    // Decided across every party, not per card: the figures are there to be
    // read against each other.
    const columns = useMemo(() => partyBodyColumns(partiesWithPersons), [partiesWithPersons]);

    // A party is as often looked for by a member's name as by its own.
    const searchKeys = useCallback((party: PartyWithPersons) => [
        party.name,
        party.name_en,
        party.name_short,
        party.name_short_en,
        getLocalizedName(party, locale),
        ...party.people.flatMap(person => [person.name, person.name_en]),
    ], [locale]);

    return (
        <div>
            <List
                items={orderedParties}
                editable={canEdit}
                ItemComponent={PartyCard}
                itemProps={{ columns }}
                FormComponent={PartyForm}
                formProps={{ cityId }}
                t={t}
                // A quiet filter over the loaded rows. The identity band's field
                // is the page's search, and it searches transcripts instead.
                searchKeys={searchKeys}
                showCount
                smColumns={1}
                mdColumns={2}
                lgColumns={3}
            />
            {peopleWithoutParties && peopleWithoutParties.length > 0 && (
                <div className="mt-8 px-4">
                    <p className="text-gray-600 dark:text-gray-400">
                        {t('peopleWithoutParties')}{' '}
                        {peopleWithoutParties.map((person, index) => (
                            // The key belongs on the mapped child, which is the
                            // fragment — on the anchor inside it React never saw it.
                            <Fragment key={person.id}>
                                <a
                                    href={`/${cityId}/people/${person.id}`}
                                    className="hover:underline text-blue-600 dark:text-blue-400"
                                >
                                    {person.name}
                                </a>
                                {index < peopleWithoutParties.length - 1 ? ', ' : ''}
                            </Fragment>
                        ))}
                    </p>
                </div>
            )}
        </div>
    );
} 
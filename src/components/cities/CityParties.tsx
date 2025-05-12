"use client";
import { useTranslations } from 'next-intl';
import List from '@/components/List';
import PartyCard from '@/components/parties/PartyCard';
import PartyForm from '@/components/parties/PartyForm';
import { PartyWithPersons } from '@/lib/db/parties';
import { useMemo } from 'react';
import { Person } from '@prisma/client';

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

    // Sort parties by member count, heads, and alphabetically
    const orderedParties = useMemo(() => {
        return [...partiesWithPersons]
            .sort((a, b) => {
                // Sort by member count first
                const memberCountDiff = b.people.length - a.people.length;
                if (memberCountDiff !== 0) return memberCountDiff;

                // If same member count, sort by party head
                const aHasHead = a.people.some(person =>
                    person.roles.some(role => role.partyId === a.id && role.isHead)
                );
                const bHasHead = b.people.some(person =>
                    person.roles.some(role => role.partyId === b.id && role.isHead)
                );
                if (aHasHead && !bHasHead) return -1;
                if (!aHasHead && bHasHead) return 1;

                // If still tied, sort alphabetically
                return a.name.localeCompare(b.name);
            });
    }, [partiesWithPersons]);
    return (
        <div>
            <List
                items={orderedParties}
                editable={canEdit}
                ItemComponent={PartyCard}
                FormComponent={PartyForm}
                formProps={{ cityId }}
                t={t}
                smColumns={1}
                mdColumns={2}
                lgColumns={3}
            />
            {peopleWithoutParties && peopleWithoutParties.length > 0 && (
                <div className="mt-8 px-4">
                    <p className="text-gray-600 dark:text-gray-400">
                        Πρόσωπα εκτός παρατάξεων:{' '}
                        {peopleWithoutParties.map((person, index) => (
                            <>
                                <a
                                    key={person.id}
                                    href={`/${cityId}/people/${person.id}`}
                                    className="hover:underline text-blue-600 dark:text-blue-400"
                                >
                                    {person.name}
                                </a>
                                {index < peopleWithoutParties.length - 1 ? ', ' : ''}
                            </>
                        ))}
                    </p>
                </div>
            )}
        </div>
    );
} 
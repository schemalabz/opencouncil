"use client";
import { useTranslations } from 'next-intl';
import List from '@/components/List';
import PartyCard from '@/components/parties/PartyCard';
import PartyForm from '@/components/parties/PartyForm';
import { PartyWithPersons } from '@/lib/db/parties';
import { sortParties } from '@/lib/sorting/parties';
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

    const orderedParties = useMemo(() => sortParties(partiesWithPersons), [partiesWithPersons]);
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
                        {t('peopleWithoutParties')}{' '}
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
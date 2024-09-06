"use client";
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import FormSheet from '../FormSheet';
import PartyForm from './PartyForm';
import { City, Party, Person } from '@prisma/client';
import Image from 'next/image';
import { ImageOrInitials } from '../ImageOrInitials';
import { Button } from '../ui/button';
import { deleteParty } from '@/lib/db/parties';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';

export default function PartyC({ city, party, editable }: { city: City, party: Party & { persons: Person[] }, editable: boolean }) {
    const t = useTranslations('Party');
    const router = useRouter();

    const onDelete = async () => {
        await deleteParty(party.id).then(() => {
            toast({
                title: t('partyDeleted', { name: party.name }),
            });
            router.push(`/${city.id}`);
        });
    }

    return (
        <div className="container mx-auto py-8">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center space-x-4">
                    <ImageOrInitials imageUrl={party.logo} width={90} height={90} name={party.name_short} color={party.colorHex} />
                    <div>
                        <h1 className="text-3xl font-bold">{party.name}</h1>
                    </div>
                </div>
                {editable && (<div className="flex items-center space-x-4">
                    <FormSheet FormComponent={PartyForm} formProps={{ party, cityId: city.id }} title={t('editParty')} type="edit" />
                    <Button onClick={onDelete}>{t('deleteParty')}</Button>
                </div>)}
            </div>
        </div>
    );
}

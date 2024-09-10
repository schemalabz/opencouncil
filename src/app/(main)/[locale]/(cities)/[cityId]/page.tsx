"use server";
import { isEditMode } from '@/lib/auth';
import CityC from '../../../../../components/cities/City';
import { notFound } from 'next/navigation';
import React from 'react';
import { getFullCity } from '@/lib/db/cities';

export default async function CityPage({ params }: { params: { cityId: string } }) {
    const city = await getFullCity(params.cityId);

    if (!city) {
        notFound();
    }

    return <CityC city={city} editable={isEditMode()} />;
}
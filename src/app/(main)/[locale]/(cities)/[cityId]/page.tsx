import { isEditMode } from '@/lib/auth';
import CityC from '../../../../../components/cities/City';
import { notFound } from 'next/navigation';
import React from 'react';
import { getCities, getFullCity } from '@/lib/db/cities';
import { unstable_setRequestLocale } from 'next-intl/server';

export async function generateStaticParams({ params }: { params: { cityId: string, locale: string } }) {
    const cities = await getCities();
    return cities.map((city) => ({
        cityId: city.id,
        locale: "el"
    }));
}

export default async function CityPage({ params }: { params: { cityId: string, locale: string } }) {
    unstable_setRequestLocale(params.locale);
    const city = await getFullCity(params.cityId);

    if (!city) {
        notFound();
    }

    return <CityC city={city} editable={isEditMode()} />;
}
"use server";
import { isEditMode } from '@/lib/auth';
import CityC from '../../../../../components/cities/City';
import { PrismaClient } from '@prisma/client'
import { notFound } from 'next/navigation';
import React from 'react';
import { getFullCity } from '@/lib/db/cities';

export default async function CityPage({ params }: { params: { cityId: string } }) {
    const prisma = new PrismaClient()
    const city = await getFullCity(params.cityId);

    if (!city) {
        notFound();
    }

    return <CityC city={city} editable={isEditMode()} />;
}
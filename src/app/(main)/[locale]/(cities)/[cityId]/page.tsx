"use server";
import CityC from '../../../../../components/cities/City';
import { PrismaClient } from '@prisma/client'
import { notFound } from 'next/navigation';
import React from 'react';
export default async function CityPage({ params }: { params: { cityId: string } }) {
    const prisma = new PrismaClient()
    const city = await prisma.city.findUnique({
        where: {
            id: params.cityId,
        },
        include: {
            councilMeetings: true,
            parties: {
                include: {
                    persons: true
                }
            },
            persons: {
                include: {
                    party: true
                }
            }
        }
    });

    if (!city) {
        notFound();
    }

    return <CityC city={city} editable={true} />;
}
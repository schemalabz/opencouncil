import { City } from '@prisma/client';
import CityC from '@/components/cities/City';
import { PrismaClient } from '@prisma/client'
import { notFound } from 'next/navigation';

const prisma = new PrismaClient()

export default async function CityPage({ params }: { params: { id: string } }) {
    const city = await prisma.city.findUnique({
        where: {
            id: params.id,
        },
    });

    if (!city) {
        notFound();
    }

    return <CityC city={city} editable={true} />;
}
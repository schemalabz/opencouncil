import { NextRequest, NextResponse } from 'next/server';
import { getAdministrativeBodiesForCity, createAdministrativeBody } from '@/lib/db/administrativeBodies';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';

const bodySchema = z.object({
    name: z.string().min(2, {
        message: "Name must be at least 2 characters.",
    }),
    name_en: z.string().min(2, {
        message: "Name (English) must be at least 2 characters.",
    }),
    type: z.enum(['council', 'committee', 'community'])
});

export async function GET(
    request: NextRequest,
    { params }: { params: { cityId: string } }
) {
    try {
        const { cityId } = params;

        const administrativeBodies = await prisma.administrativeBody.findMany({
            where: {
                cityId,
            },
            orderBy: {
                name: 'asc',
            },
        });

        return NextResponse.json(administrativeBodies);
    } catch (error) {
        console.error('Error fetching administrative bodies:', error);
        return NextResponse.json(
            { error: 'Failed to fetch administrative bodies' },
            { status: 500 }
        );
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: { cityId: string } }
) {
    try {
        const cityId = params.cityId;
        const body = await request.json();
        const { name, name_en, type } = bodySchema.parse(body);

        const newBody = await createAdministrativeBody({
            name,
            name_en,
            type,
            cityId,
        });

        return NextResponse.json(newBody, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors }, { status: 400 });
        }
        console.error('Failed to create administrative body:', error);
        return NextResponse.json(
            { error: 'Failed to create administrative body' },
            { status: 500 }
        );
    }
} 

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { withUserAuthorizedToEdit } from '@/lib/auth';

export async function GET() {
    await withUserAuthorizedToEdit({});
    const items = await prisma.consultation.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            city: {
                select: { id: true, name: true }
            },
            _count: {
                select: { comments: true }
            }
        }
    });
    return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
    await withUserAuthorizedToEdit({});
    const body = await req.json();
    const { name, jsonUrl, endDate, isActive, cityId } = body as {
        name: string;
        jsonUrl: string;
        endDate: string;
        isActive?: boolean;
        cityId: string;
    };

    if (!name || !jsonUrl || !endDate || !cityId) {
        return NextResponse.json(
            { error: 'name, jsonUrl, endDate, and cityId are required' },
            { status: 400 }
        );
    }

    // Validate the city exists and has consultations enabled
    const city = await prisma.city.findUnique({
        where: { id: cityId },
        select: { id: true, consultationsEnabled: true }
    });

    if (!city) {
        return NextResponse.json({ error: 'City not found' }, { status: 404 });
    }

    if (!city.consultationsEnabled) {
        return NextResponse.json(
            { error: 'Consultations are not enabled for this city. Enable them first in city settings.' },
            { status: 400 }
        );
    }

    const created = await prisma.consultation.create({
        data: {
            name,
            jsonUrl,
            endDate: new Date(endDate),
            isActive: isActive ?? true,
            cityId
        },
        include: {
            city: {
                select: { id: true, name: true }
            }
        }
    });

    return NextResponse.json(created, { status: 201 });
}

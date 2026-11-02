import { NextRequest, NextResponse } from 'next/server';
import { getAdminRealms } from '@/lib/auth';
import { getConsultationsForAdmin, createConsultation } from '@/lib/db/consultations';
import { handleApiError } from '@/lib/api/errors';

export async function GET() {
    try {
        const realms = await getAdminRealms();
        const items = await getConsultationsForAdmin(realms);
        return NextResponse.json(items);
    } catch (error) {
        return handleApiError(error, 'Failed to fetch consultations');
    }
}

export async function POST(req: NextRequest) {
    try {
        await getAdminRealms();
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

        // createConsultation checks the `admin` right on the city.
        const created = await createConsultation({ name, jsonUrl, endDate, isActive, cityId });
        return NextResponse.json(created, { status: 201 });
    } catch (error) {
        return handleApiError(error, 'Failed to create consultation');
    }
}

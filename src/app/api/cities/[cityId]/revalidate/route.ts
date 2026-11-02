import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { withRight } from '@/lib/auth';
import { handleApiError } from '@/lib/api/errors';

export async function POST(request: Request, props: { params: Promise<{ cityId: string }> }) {
    const { cityId } = await props.params;
    try {
        await withRight('admin', { cityId });
    } catch (error) {
        return handleApiError(error, 'Not authorized to revalidate the city cache');
    }

    console.log('Revalidating cache for city', cityId);

    // Revalidate the main city tag - this will invalidate all cached entries for this city
    revalidateTag(`city:${cityId}`, 'max');
    revalidatePath(`/${cityId}`, "layout");

    return NextResponse.json({ 
        revalidated: true, 
        cityId,
        timestamp: new Date().toISOString() 
    });
}

import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { isUserAuthorizedToEdit } from '@/lib/auth';

export async function POST(
    request: Request,
    { params }: { params: { cityId: string } }
) {
    if (!isUserAuthorizedToEdit({})) {
        return NextResponse.json({ error: 'Unauthorized: Only super admins can revalidate city cache' }, { status: 401 });
    }
    
    const cityId = params.cityId;
    console.log('Revalidating cache for city', cityId);

    // Revalidate the main city tag - this will invalidate all cached entries for this city
    const mainTag = `city:${cityId}`;
    console.log(`Revalidating tag: ${mainTag}`);
    revalidateTag(mainTag);

    return NextResponse.json({ 
        revalidated: true, 
        cityId,
        timestamp: new Date().toISOString() 
    });
} 
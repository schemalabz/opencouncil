import { NextResponse } from 'next/server';
import { getUserPreferences } from '@/lib/db/notifications';

/**
 * API route to fetch user preferences (wraps server action for client-side access)
 */
export async function GET() {
    try {
        const preferences = await getUserPreferences();
        return NextResponse.json(preferences);
    } catch (error) {
        // User not authenticated or error fetching preferences
        // Return empty array (client will use defaults)
        return NextResponse.json([]);
    }
}

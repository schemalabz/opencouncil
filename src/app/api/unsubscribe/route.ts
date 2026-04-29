import { NextRequest, NextResponse } from 'next/server';
import { verifyUnsubscribeToken } from '@/lib/notifications/tokens';
import { disableNotificationPreferenceByCityId, disableAllNotificationPreferences } from '@/lib/db/notifications';
import { updateUserProfile } from '@/lib/db/users';
import { handleApiError } from '@/lib/api/errors';

export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { token, action } = (body ?? {}) as { token?: string; action?: string };

    if (!token) {
        return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const data = await verifyUnsubscribeToken(token);
    if (!data) {
        return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
    }

    if (action !== 'all' && action !== 'city' && action !== 'preferences') {
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    try {
        if (action === 'all') {
            await Promise.all([
                updateUserProfile(data.userId, { allowProductUpdates: false, allowPetitionUpdates: false }),
                disableAllNotificationPreferences(data.userId),
            ]);
        } else if (action === 'city') {
            if (!data.cityId) {
                return NextResponse.json({ error: 'Token has no city scope' }, { status: 400 });
            }
            await disableNotificationPreferenceByCityId(data.userId, data.cityId);
        } else {
            const { allowProductUpdates, allowPetitionUpdates, unsubscribeCity } = (body ?? {}) as {
                allowProductUpdates?: unknown;
                allowPetitionUpdates?: unknown;
                unsubscribeCity?: unknown;
            };
            if (typeof allowProductUpdates !== 'boolean' || typeof allowPetitionUpdates !== 'boolean') {
                return NextResponse.json({ error: 'Invalid preferences' }, { status: 400 });
            }
            if (unsubscribeCity === true && !data.cityId) {
                return NextResponse.json({ error: 'Token has no city scope' }, { status: 400 });
            }
            const operations: Promise<unknown>[] = [
                updateUserProfile(data.userId, { allowProductUpdates, allowPetitionUpdates }),
            ];
            if (unsubscribeCity === true && data.cityId) {
                operations.push(disableNotificationPreferenceByCityId(data.userId, data.cityId));
            }
            await Promise.all(operations);
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error, 'Failed to unsubscribe');
    }
}

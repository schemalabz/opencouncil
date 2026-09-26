'use server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { deriveAndPersist } from './persist';
import type { DerivationOutput } from './types';

/** Re-run the derivation for a meeting from its stored facts, without polling. */
export async function rederiveMeeting(cityId: string, meetingId: string): Promise<DerivationOutput> {
    await withUserAuthorizedToEdit({ cityId });
    return deriveAndPersist(cityId, meetingId);
}

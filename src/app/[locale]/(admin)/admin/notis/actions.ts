"use server";

import { revalidatePath } from 'next/cache';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { enableNextBatch, setNotisEnabled } from '@/lib/db/notis-rollout';

export async function toggleNotisAction(
    userId: string,
    enable: boolean,
): Promise<{ success: boolean; error?: string }> {
    await withUserAuthorizedToEdit({});
    try {
        await setNotisEnabled(userId, enable);
        revalidatePath('/admin/notis');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed' };
    }
}

export async function enableBatchAction(
    n: number,
): Promise<{ success: boolean; enabled?: number; remaining?: number; error?: string }> {
    await withUserAuthorizedToEdit({});
    try {
        const result = await enableNextBatch(n);
        revalidatePath('/admin/notis');
        return { success: true, ...result };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed' };
    }
}

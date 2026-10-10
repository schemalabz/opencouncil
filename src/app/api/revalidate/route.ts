import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { isUserAuthorizedToEdit } from '@/lib/auth';
import * as z from 'zod';
import { revalidateRequestSchema } from '@/lib/zod-schemas/revalidate';

export async function POST(request: Request) {
    if (!await isUserAuthorizedToEdit({})) {
        return NextResponse.json({ error: 'Unauthorized: Only super admins can revalidate cache' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { tags, paths } = revalidateRequestSchema.parse(body);

        const revalidatedTags: string[] = [];
        const revalidatedPaths: string[] = [];

        // Revalidate tags if provided
        if (tags && tags.length > 0) {
            for (const tag of tags) {
                revalidateTag(tag, 'max');
                revalidatedTags.push(tag);
            }
        }

        // Revalidate paths if provided
        if (paths && paths.length > 0) {
            for (const { path, type } of paths) {
                revalidatePath(path, type);
                revalidatedPaths.push(path);
            }
        }

        return NextResponse.json({
            revalidated: true,
            tags: revalidatedTags,
            paths: revalidatedPaths,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        console.error('Error revalidating cache:', error);
        return NextResponse.json(
            { error: 'Failed to revalidate cache' },
            { status: 500 }
        );
    }
} 
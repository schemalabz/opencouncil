import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { isUserAuthorizedToEdit } from '@/lib/auth';
import { z } from 'zod';

const revalidateSchema = z.object({
    tags: z.array(z.string()).optional(),
    paths: z.array(z.object({
        path: z.string(),
        type: z.enum(['page', 'layout']).optional()
    })).optional()
});

export async function POST(request: Request) {
    if (!isUserAuthorizedToEdit({})) {
        return NextResponse.json({ error: 'Unauthorized: Only super admins can revalidate cache' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { tags, paths } = revalidateSchema.parse(body);

        const revalidatedTags: string[] = [];
        const revalidatedPaths: string[] = [];

        // Revalidate tags if provided
        if (tags && tags.length > 0) {
            for (const tag of tags) {
                revalidateTag(tag);
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
            return NextResponse.json({ error: error.errors }, { status: 400 });
        }
        console.error('Error revalidating cache:', error);
        return NextResponse.json(
            { error: 'Failed to revalidate cache' },
            { status: 500 }
        );
    }
} 
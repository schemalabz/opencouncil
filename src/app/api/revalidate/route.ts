import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { revalidateRequestSchema } from '@/lib/zod-schemas/revalidate';
import { handleApiError } from '@/lib/api/errors';

export async function POST(request: Request) {
    try {
        await withUserAuthorizedToEdit({});

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
        return handleApiError(error, 'Failed to revalidate cache');
    }
} 
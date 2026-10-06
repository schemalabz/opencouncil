import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listBodyAdmins, addBodyAdmin, removeBodyAdmin } from '@/lib/db/bodyAdmins';
import { handleApiError } from '@/lib/api/errors';

type Params = { params: Promise<{ cityId: string; bodyId: string }> };

const addSchema = z.object({
    email: z.string().trim().toLowerCase().email("Invalid email address"),
    name: z.string().trim().min(1).nullable().optional(),
});

const removeSchema = z.object({
    userId: z.string().min(1),
});

/** The admins of the body. For an admin of the body, of its city, or a superadmin. */
export async function GET(request: NextRequest, props: Params) {
    const { cityId, bodyId } = await props.params;
    try {
        return NextResponse.json(await listBodyAdmins(cityId, bodyId));
    } catch (error) {
        return handleApiError(error, 'Failed to list the admins of the body');
    }
}

/** Invite an admin to the body, by email. A new email gets an account and an invite. */
export async function POST(request: NextRequest, props: Params) {
    const { cityId, bodyId } = await props.params;
    try {
        const { email, name } = addSchema.parse(await request.json());
        const result = await addBodyAdmin(cityId, bodyId, { email, name }, request);
        return NextResponse.json(result, { status: result.created ? 201 : 200 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors }, { status: 400 });
        }
        return handleApiError(error, 'Failed to add an admin to the body');
    }
}

/** Remove an admin from the body. The account stays. */
export async function DELETE(request: NextRequest, props: Params) {
    const { cityId, bodyId } = await props.params;
    try {
        const { userId } = removeSchema.parse(await request.json());
        await removeBodyAdmin(cityId, bodyId, userId);
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors }, { status: 400 });
        }
        return handleApiError(error, 'Failed to remove an admin from the body');
    }
}

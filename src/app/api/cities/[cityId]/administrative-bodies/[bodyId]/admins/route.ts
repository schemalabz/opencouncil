import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { listBodyAdmins, addBodyAdmin, removeBodyAdmin } from '@/lib/db/bodyAdmins';
import { handleApiError } from '@/lib/api/errors';
import { addBodyAdminRequestSchema, removeBodyAdminRequestSchema } from '@/lib/zod-schemas/user';

type Params = { params: Promise<{ cityId: string; bodyId: string }> };

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
        // The check runs before the parse, so a caller without rights learns
        // nothing about the schema.
        await withUserAuthorizedToEdit({ cityId, administrativeBodyId: bodyId });
        const { email, name } = addBodyAdminRequestSchema.parse(await request.json());
        const result = await addBodyAdmin(cityId, bodyId, { email, name }, request);
        return NextResponse.json(result, { status: result.created ? 201 : 200 });
    } catch (error) {
        return handleApiError(error, 'Failed to add an admin to the body');
    }
}

/** Remove an admin from the body. The account stays. */
export async function DELETE(request: NextRequest, props: Params) {
    const { cityId, bodyId } = await props.params;
    try {
        await withUserAuthorizedToEdit({ cityId, administrativeBodyId: bodyId });
        const { userId } = removeBodyAdminRequestSchema.parse(await request.json());
        await removeBodyAdmin(cityId, bodyId, userId);
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        return handleApiError(error, 'Failed to remove an admin from the body');
    }
}

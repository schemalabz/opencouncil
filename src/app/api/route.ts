import { NextResponse } from "next/server";
import { getCurrentUser } from '@/lib/auth';
import { getOpenApiSpec } from '@/lib/openapi';
import { filterSpecByAccessLevel, getUserAccessLevel } from '@/lib/utils/openapi';

export async function GET() {
    const user = await getCurrentUser();
    const userLevel = getUserAccessLevel(user);

    return NextResponse.json(filterSpecByAccessLevel(getOpenApiSpec(), userLevel));
}

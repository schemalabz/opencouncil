import fs from 'fs';
import { NextRequest, NextResponse } from "next/server";
import yaml from 'js-yaml';
import { getCurrentUser } from '@/lib/auth';
import { filterSpecByAccessLevel, type AccessLevel, type OpenApiSpec } from '@/lib/utils/openapi';

export async function GET(request: NextRequest) {
    const spec = yaml.load(fs.readFileSync('./swagger.yaml', 'utf8')) as OpenApiSpec;

    const user = await getCurrentUser();

    let userLevel: AccessLevel = 'public';
    if (user) {
        if (user.isSuperAdmin) {
            userLevel = 'superadmin';
        } else if (user.administers.length > 0) {
            userLevel = 'admin';
        } else {
            userLevel = 'user';
        }
    }

    return NextResponse.json(filterSpecByAccessLevel(spec, userLevel));
}

import fs from 'fs';
import { NextRequest, NextResponse } from "next/server";
import yaml from 'js-yaml';
import { getCurrentUser } from '@/lib/auth';
import { filterSpecByAccessLevel, getUserAccessLevel, type OpenApiSpec } from '@/lib/utils/openapi';

export async function GET(request: NextRequest) {
    const spec = yaml.load(fs.readFileSync('./swagger.yaml', 'utf8')) as OpenApiSpec;

    const user = await getCurrentUser();
    const userLevel = getUserAccessLevel(user);

    return NextResponse.json(filterSpecByAccessLevel(spec, userLevel));
}

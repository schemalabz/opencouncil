import fs from 'fs/promises';
import { NextRequest, NextResponse } from "next/server";
import yaml from 'js-yaml';
import { getCurrentUser } from '@/lib/auth';
import { filterSpecByAccessLevel, getUserAccessLevel, type OpenApiSpec } from '@/lib/utils/openapi';

export async function GET(request: NextRequest) {
    try {
        const yamlString = await fs.readFile('./swagger.yaml', 'utf8');
        const spec = yaml.load(yamlString) as OpenApiSpec;

        const user = await getCurrentUser();
        const userLevel = getUserAccessLevel(user);

        return NextResponse.json(filterSpecByAccessLevel(spec, userLevel));
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to load API specification' },
            { status: 500 }
        );
    }
}

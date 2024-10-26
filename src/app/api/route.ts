import fs from 'fs';
import { NextRequest, NextResponse } from "next/server";
import yaml from 'js-yaml';

export async function GET(request: NextRequest) {
    const spec = fs.readFileSync('./swagger.yaml', 'utf8');
    const yamlSpec = yaml.load(spec);
    return NextResponse.json(yamlSpec);
}
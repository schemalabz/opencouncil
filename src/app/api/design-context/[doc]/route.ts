// src/app/api/design-context/[doc]/route.ts
import { NextRequest } from 'next/server';
import { getDesignContext, isDesignContextDoc } from '@/lib/design-system/llm-context';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ doc: string }> }
) {
    const { doc } = await params;
    if (!isDesignContextDoc(doc)) {
        return new Response('Not found', { status: 404 });
    }
    return new Response(getDesignContext(doc), {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
}

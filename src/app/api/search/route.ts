import { NextRequest, NextResponse } from 'next/server';
import { search } from '@/lib/search';
import { searchRequestSchema } from '@/lib/zod-schemas/search';
import type { SearchRequest } from '@/lib/search/types';
import { searchError } from '@/lib/api/errors';

// Hardcoded search configuration
const SEARCH_CONFIG = {
    enableSemanticSearch: true
} as const;

export async function POST(request: NextRequest) {
    try {
        // Parse and validate the request body
        const body = await request.json();
        const validatedRequest = searchRequestSchema.parse(body);

        // The filters have the search's own names and units, so they pass
        // through. Only paging and detail are API-shaped.
        const { page, pageSize, detailed, ...filters } = validatedRequest;
        const searchRequest: SearchRequest = {
            ...filters,
            config: {
                ...SEARCH_CONFIG,
                size: pageSize,
                from: (page - 1) * pageSize,
                detailed
            }
        };

        // Perform the search
        const { results, total, derivedFilters } = await search(searchRequest);

        // Calculate pagination metadata
        const totalPages = Math.ceil(total / validatedRequest.pageSize);

        // Return paginated results
        return NextResponse.json({
            results,
            pagination: {
                total,
                page: validatedRequest.page,
                pageSize: validatedRequest.pageSize,
                totalPages
            },
            // The search reads the query text for filters, so a request that
            // named a municipality or a period in prose comes back narrowed.
            // Reporting it is the difference between a caller that can see the
            // scope it got and one that reads a filtered page as the whole realm.
            derivedFilters
        });
    } catch (error) {
        return searchError(error);
    }
}

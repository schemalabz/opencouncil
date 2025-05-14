import { NextRequest, NextResponse } from 'next/server';
import { search } from '@/lib/search/search';
import { z } from 'zod';

// Define the search request schema
const searchRequestSchema = z.object({
    query: z.string().min(1),
    cityIds: z.array(z.string()).optional(),
    personIds: z.array(z.string()).optional(),
    partyIds: z.array(z.string()).optional(),
    topicIds: z.array(z.string()).optional(),
    dateRange: z.object({
        start: z.string().datetime(),
        end: z.string().datetime()
    }).optional(),
    location: z.object({
        point: z.object({
            lat: z.number(),
            lon: z.number()
        }),
        radius: z.number().min(0).max(100).default(5)
    }).optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(10),
    detailed: z.boolean().default(false)
});

// Hardcoded search configuration
const SEARCH_CONFIG = {
    enableSemanticSearch: true,
    rankWindowSize: 100,
    rankConstant: 60
} as const;

export async function POST(request: NextRequest) {
    try {
        // Parse and validate the request body
        const body = await request.json();
        const validatedRequest = searchRequestSchema.parse(body);

        // Calculate offset for pagination
        const offset = (validatedRequest.page - 1) * validatedRequest.pageSize;

        // Prepare search request
        const searchRequest = {
            ...validatedRequest,
            config: {
                ...SEARCH_CONFIG,
                size: validatedRequest.pageSize,
                from: offset,
                detailed: validatedRequest.detailed
            }
        };

        // Perform the search
        const { results, total } = await search(searchRequest);

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
            }
        });
    } catch (error) {
        console.error('Search error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    error: {
                        code: 'INVALID_REQUEST',
                        message: 'Invalid request parameters',
                        details: error.errors
                    }
                },
                { status: 400 }
            );
        }

        return NextResponse.json(
            {
                error: {
                    code: 'SEARCH_ERROR',
                    message: 'An error occurred while performing the search',
                    details: error instanceof Error ? error.message : 'Unknown error'
                }
            },
            { status: 500 }
        );
    }
} 
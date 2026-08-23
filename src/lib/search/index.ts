"use server";

import { SearchRequest, SearchResponse } from './types';
import { searchInRealm } from './core';
import { getRealm } from '@/lib/realm.server';

// Re-export types
export type {
    SearchResultLight,
    SearchResultDetailed,
    SearchConfig,
} from './types';

/**
 * Search, capped to the realm of the incoming request.
 *
 * This module is a Server Action boundary, so every argument here is
 * caller-controlled — including anything a browser cares to send. The realm is
 * therefore resolved from the request Host and is not part of `SearchRequest`;
 * a client cannot widen the search to another tenant by asking for one.
 *
 * Server-side callers that carry their own realm context and run outside a
 * request scope (the MCP tool handlers) call `searchInRealm` in ./core
 * directly, rather than reaching this entry point.
 *
 * `getRealm` is handed over as a resolver rather than awaited here, so a
 * failure reading the request headers lands in the same logged, sanitized
 * error path as every other search failure.
 */
export async function search(
    request: SearchRequest,
    options?: { skipQueryLog?: boolean }
): Promise<SearchResponse> {
    return searchInRealm(request, getRealm, options);
}

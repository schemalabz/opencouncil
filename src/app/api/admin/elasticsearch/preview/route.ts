import { NextRequest, NextResponse } from 'next/server';
import { buildSyncQuery } from '@/lib/elasticsearch/queryTemplate';
import { validateCityIds } from '@/lib/elasticsearch/validator';
import prisma from '@/lib/db/prisma';

export async function POST(request: NextRequest) {
  try {
    const { cityIds, limit = 5, cityId, meetingId, subjectId } = await request.json();

    if (!cityIds || !Array.isArray(cityIds) || cityIds.length === 0) {
      return NextResponse.json(
        { error: 'Valid cityIds array is required' },
        { status: 400 }
      );
    }

    // Validate that the cities exist
    const cityValidation = await validateCityIds(cityIds);
    if (!cityValidation.isValid) {
      return NextResponse.json(
        { error: cityValidation.errorMessage },
        { status: 400 }
      );
    }

    // Build the sync query
    const syncQuery = buildSyncQuery(cityIds);
    
    // Add additional filters if provided
    let filteredQuery = syncQuery;
    const additionalFilters: string[] = [];
    
    if (cityId) {
      additionalFilters.push(`m."cityId" = '${cityId.replace(/'/g, "''")}'`);
    }
    
    if (meetingId) {
      additionalFilters.push(`m.id = '${meetingId.replace(/'/g, "''")}'`);
    }
    
    if (subjectId) {
      additionalFilters.push(`s.id = '${subjectId.replace(/'/g, "''")}'`);
    }
    
    // If we have additional filters, modify the query
    if (additionalFilters.length > 0) {
      // Add filters after the existing WHERE clause
      const whereClauseRegex = /(WHERE m\."cityId" IN \([^)]*\))/;
      const additionalWhere = additionalFilters.join(' AND ');
      filteredQuery = syncQuery.replace(whereClauseRegex, `$1 AND ${additionalWhere}`);
    }
    
    // Add LIMIT to the query to get sample results
    const limitedQuery = `${filteredQuery} LIMIT ${Math.min(limit, 10)}`;

    const startTime = Date.now();

    // Execute the query
    const results = await prisma.$queryRawUnsafe(limitedQuery);
    
    const executionTime = Date.now() - startTime;

    // Get total count without limit
    const countQuery = filteredQuery.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
    const countResult = await prisma.$queryRawUnsafe(countQuery) as Array<{ total: bigint }>;
    const totalDocuments = Number(countResult[0]?.total || 0);

    return NextResponse.json({
      success: true,
      query: filteredQuery,
      sampleDocuments: results,
      sampleCount: Array.isArray(results) ? results.length : 0,
      totalDocuments,
      executionTime,
      cityIds,
      filters: {
        cityId: cityId || null,
        meetingId: meetingId || null,
        subjectId: subjectId || null
      }
    });

  } catch (error) {
    console.error('Preview query execution failed:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to execute preview query',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 
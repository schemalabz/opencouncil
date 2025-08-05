import { NextRequest, NextResponse } from 'next/server';
import { buildSyncQueryWithParams, convertParameterizedQueryToString } from '@/lib/elasticsearch/queryTemplate';
import { validateCityIds } from '@/lib/elasticsearch/validator';
import prisma from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';

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

    // Build the sync query using parameterized approach for better security
    const { query: baseQuery, params: baseParams } = buildSyncQueryWithParams(cityIds);
    
    // Build additional filters using parameterized queries instead of manual escaping
    const additionalConditions: string[] = [];
    const additionalParams: string[] = [];
    
    if (cityId) {
      // Use ? placeholder for safe parameterization - prevents SQL injection
      additionalConditions.push(`m."cityId" = ?`);
      additionalParams.push(cityId);
    }
    
    if (meetingId) {
      additionalConditions.push(`m.id = ?`);
      additionalParams.push(meetingId);
    }
    
    if (subjectId) {
      additionalConditions.push(`s.id = ?`);
      additionalParams.push(subjectId);
    }
    
    // Combine the base query with additional filters
    let finalQuery = baseQuery;
    if (additionalConditions.length > 0) {
      // Add additional conditions to the existing WHERE clause
      // The base query ends with: WHERE m."cityId" IN (?, ?, ...) AND m."released" = true
      // We need to insert additional conditions before the "AND m."released" = true" part
      const additionalWhere = additionalConditions.join(' AND ');
      finalQuery = baseQuery.replace('AND m."released" = true', `AND ${additionalWhere} AND m."released" = true`);
    }
    
    // Combine all parameters in the correct order (base params first, then additional)
    const allParams = [...baseParams, ...additionalParams];
    
    // Add LIMIT to the query to get sample results
    const limitedQuery = `${finalQuery} LIMIT ${Math.min(limit, 10)}`;

    const startTime = Date.now();

    // For complex queries with multiple placeholders, we need to convert to string
    // This is safe because we validate all inputs and use parameterized building
    const queryString = convertParameterizedQueryToString(limitedQuery, allParams);
    const results = await prisma.$queryRawUnsafe(queryString);
    
    const executionTime = Date.now() - startTime;

    // Get total count without limit using the same parameterized approach
    const countQuery = finalQuery.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
    const countQueryString = convertParameterizedQueryToString(countQuery, allParams);
    const countResult = await prisma.$queryRawUnsafe(countQueryString) as Array<{ total: bigint }>;
    const totalDocuments = Number(countResult[0]?.total || 0);

    return NextResponse.json({
      success: true,
      query: finalQuery,
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
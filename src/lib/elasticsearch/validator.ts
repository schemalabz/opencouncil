import prisma from '@/lib/db/prisma';
import { buildSyncQuery, validateQueryStructure } from './queryTemplate';
import { ValidationResult } from '@/types/elasticsearch';

/**
 * Validates the current remote query that's actually running in Elasticsearch
 * This checks if the live system is healthy and working correctly
 * 
 * @param remoteQuery The actual query from Elasticsearch connector
 * @returns ValidationResult indicating if the remote system is healthy
 */
export async function validateRemoteQuery(remoteQuery: string): Promise<ValidationResult> {
  const startTime = Date.now();
  
  try {
    if (!remoteQuery || remoteQuery.trim() === '') {
      return {
        isValid: false,
        errorMessage: 'No remote query found. The Elasticsearch connector may not be properly configured.'
      };
    }

    // Wrap in COUNT to validate without returning large result sets
    const countQuery = `SELECT COUNT(*) as count FROM (${remoteQuery}) as remote_validation_query`;
    
    // Execute validation query
    const result = await prisma.$queryRawUnsafe(countQuery);
    const rowCount = Number((result as any)[0].count);
    
    const executionTime = Date.now() - startTime;
    
    // Check if remote query returned any results
    if (rowCount === 0) {
      return {
        isValid: false,
        rowCount: 0,
        executionTime,
        errorMessage: 'Remote query returned no results. The current Elasticsearch configuration may be filtering out all data or pointing to non-existent cities.'
      };
    }
    
    // Remote validation successful
    return {
      isValid: true,
      rowCount,
      executionTime
    };
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    return {
      isValid: false,
      executionTime,
      errorMessage: `Remote query validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Validates a proposed local configuration (template query with selected cities)
 * This checks if the user's proposed changes would work correctly
 * 
 * @param cityIds Array of city IDs for the proposed configuration
 * @returns ValidationResult indicating if the proposed configuration is valid
 */
export async function validateLocalQuery(cityIds: string[]): Promise<ValidationResult> {
  const startTime = Date.now();
  
  try {
    // Validate input
    if (!cityIds || cityIds.length === 0) {
      return {
        isValid: false,
        errorMessage: 'At least one city must be selected for the proposed configuration'
      };
    }

    // Build the proposed template query
    const proposedQuery = buildSyncQuery(cityIds);
    
    // Wrap in COUNT to validate without returning large result sets
    const countQuery = `SELECT COUNT(*) as count FROM (${proposedQuery}) as local_validation_query`;
    
    // Execute validation query
    const result = await prisma.$queryRawUnsafe(countQuery);
    const rowCount = Number((result as any)[0].count);
    
    const executionTime = Date.now() - startTime;
    
    // Check if proposed query would return results
    if (rowCount === 0) {
      return {
        isValid: false,
        rowCount: 0,
        executionTime,
        errorMessage: 'Proposed configuration would return no results. This would delete all existing data in Elasticsearch. Please check your city selection and ensure the cities have released council meetings with subjects.'
      };
    }
    
    // Local validation successful
    return {
      isValid: true,
      rowCount,
      executionTime
    };
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    // Handle specific database errors
    let errorMessage = 'Proposed configuration validation failed';
    
    if (error instanceof Error) {
      if (error.message.includes('column') && error.message.includes('does not exist')) {
        errorMessage = `Database schema error: ${error.message}. The proposed query may need to be updated for the current database schema.`;
      } else if (error.message.includes('relation') && error.message.includes('does not exist')) {
        errorMessage = `Database table error: ${error.message}. Please ensure all required tables exist.`;
      } else {
        errorMessage = `Proposed configuration validation failed: ${error.message}`;
      }
    }
    
    return {
      isValid: false,
      executionTime,
      errorMessage
    };
  }
}

/**
 * Compares the remote query with a proposed local configuration
 * This shows what would change if the local configuration was applied
 * 
 * @param remoteQuery The current query from Elasticsearch connector
 * @param cityIds Array of city IDs for the proposed configuration
 * @returns ValidationResult with comparison details in queryMismatch
 */
export async function compareRemoteAndLocal(remoteQuery: string, cityIds: string[]): Promise<ValidationResult> {
  const startTime = Date.now();
  
  try {
    if (!remoteQuery || remoteQuery.trim() === '') {
      return {
        isValid: false,
        errorMessage: 'No remote query available for comparison. Cannot compare configurations.'
      };
    }

    if (!cityIds || cityIds.length === 0) {
      return {
        isValid: false,
        errorMessage: 'No cities provided for comparison.'
      };
    }

    // Perform structure validation to get detailed comparison
    const structureValidation = validateQueryStructure(remoteQuery, cityIds);
    const executionTime = Date.now() - startTime;
    
    // If everything matches, comparison is successful
    if (structureValidation.structureMatches && structureValidation.cityIdsMatch) {
      return {
        isValid: true,
        executionTime,
        queryMismatch: structureValidation
      };
    }
    
    // If there are differences, return detailed comparison
    let errorMessage = 'Configuration differences detected:\n';
    if (!structureValidation.structureMatches) {
      errorMessage += '• Query structure differs from expected template\n';
    }
    if (!structureValidation.cityIdsMatch) {
      errorMessage += `• City configuration: Current [${structureValidation.actualCityIds.join(', ')}] → Proposed [${structureValidation.expectedCityIds.join(', ')}]\n`;
    }
    errorMessage += '\nApplying the proposed configuration will update the remote system to match your selection.';

    return {
      isValid: false, // false indicates there are differences, not that it's broken
      executionTime,
      errorMessage,
      queryMismatch: structureValidation
    };
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    return {
      isValid: false,
      executionTime,
      errorMessage: `Configuration comparison failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}



/**
 * Validates that the provided city IDs exist in the database
 * 
 * @param cityIds Array of city IDs to validate
 * @returns ValidationResult indicating if all cities exist
 */
export async function validateCityIds(cityIds: string[]): Promise<ValidationResult> {
  try {
    if (!cityIds || cityIds.length === 0) {
      return {
        isValid: false,
        errorMessage: 'No cities provided for validation'
      };
    }

    const existingCities = await prisma.city.findMany({
      where: {
        id: { in: cityIds }
      },
      select: {
        id: true,
        name: true
      }
    });

    const existingCityIds = existingCities.map(city => city.id);
    const missingCityIds = cityIds.filter(id => !existingCityIds.includes(id));

    if (missingCityIds.length > 0) {
      return {
        isValid: false,
        errorMessage: `The following cities do not exist: ${missingCityIds.join(', ')}`
      };
    }

    return {
      isValid: true,
      rowCount: existingCities.length
    };

  } catch (error) {
    return {
      isValid: false,
      errorMessage: `City validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
} 
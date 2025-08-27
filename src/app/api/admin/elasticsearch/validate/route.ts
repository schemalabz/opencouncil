import { NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { 
  validateRemoteQuery, 
  validateLocalQuery, 
  compareRemoteAndLocal,
  validateCityIds 
} from '@/lib/elasticsearch/validator';
import { ConnectorService } from '@/lib/elasticsearch/connector';

/**
 * POST /api/admin/elasticsearch/validate
 * 
 * Explicit validation operations for Elasticsearch configurations:
 * - validateRemote: Check if current remote query is healthy
 * - validateLocal: Check if proposed configuration would work  
 * - compare: Compare remote vs proposed and show differences
 */
export async function POST(request: Request) {
  try {
    await withUserAuthorizedToEdit({});
    
    const body = await request.json();
    const { operation, cityIds } = body;
    
    // Validate request body
    if (!operation) {
      return NextResponse.json({
        isValid: false,
        errorMessage: 'operation must be specified: "validateRemote", "validateLocal", or "compare"'
      }, { status: 400 });
    }

    // Get connector service for fetching remote query when needed
    const connectorService = new ConnectorService();

    switch (operation) {
      case 'validateRemote': {
        // Validate current remote configuration health
        try {
          const config = await connectorService.getConnectorConfig();
          const filteringConfig = config.filtering?.[0];
          const remoteQuery = filteringConfig?.active?.advanced_snippet?.value?.[0]?.query ||
                             filteringConfig?.draft?.advanced_snippet?.value?.[0]?.query;

          if (!remoteQuery) {
            return NextResponse.json({
              isValid: false,
              errorMessage: 'No remote query found in Elasticsearch connector. The connector may not be properly configured.'
            });
          }

          const validation = await validateRemoteQuery(remoteQuery);
          
          return NextResponse.json({
            isValid: validation.isValid,
            rowCount: validation.rowCount,
            errorMessage: validation.errorMessage,
            executionTime: validation.executionTime,
            details: validation.isValid 
              ? `Current system healthy: ${validation.rowCount} subjects currently indexed`
              : undefined
          });

        } catch (error) {
          return NextResponse.json({
            isValid: false,
            errorMessage: `Failed to fetch remote configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      }

      case 'validateLocal': {
        // Validate proposed local configuration
        if (!cityIds || !Array.isArray(cityIds)) {
          return NextResponse.json({
            isValid: false,
            errorMessage: 'cityIds must be provided as an array for local validation'
          }, { status: 400 });
        }
        
        if (cityIds.length === 0) {
          return NextResponse.json({
            isValid: false,
            errorMessage: 'At least one city must be selected for local validation'
          }, { status: 400 });
        }
        
        // First validate that all city IDs exist in the database
        const cityValidation = await validateCityIds(cityIds);
        if (!cityValidation.isValid) {
          return NextResponse.json({
            isValid: false,
            errorMessage: cityValidation.errorMessage
          });
        }
        
        const validation = await validateLocalQuery(cityIds);
        
        return NextResponse.json({
          isValid: validation.isValid,
          rowCount: validation.rowCount,
          errorMessage: validation.errorMessage,
          executionTime: validation.executionTime,
          citiesValidated: cityIds.length,
          details: validation.isValid 
            ? `Proposed configuration valid: would index ${validation.rowCount} subjects across ${cityIds.length} cities`
            : undefined
        });
      }

      case 'compare': {
        // Compare remote vs proposed local configuration
        if (!cityIds || !Array.isArray(cityIds)) {
          return NextResponse.json({
            isValid: false,
            errorMessage: 'cityIds must be provided as an array for comparison'
          }, { status: 400 });
        }
        
        if (cityIds.length === 0) {
          return NextResponse.json({
            isValid: false,
            errorMessage: 'At least one city must be selected for comparison'
          }, { status: 400 });
        }

        try {
          // Get remote query for comparison
          const config = await connectorService.getConnectorConfig();
          const filteringConfig = config.filtering?.[0];
          const remoteQuery = filteringConfig?.active?.advanced_snippet?.value?.[0]?.query ||
                             filteringConfig?.draft?.advanced_snippet?.value?.[0]?.query;

          if (!remoteQuery) {
            return NextResponse.json({
              isValid: false,
              errorMessage: 'No remote query found for comparison. Cannot compare configurations.'
            });
          }

          // First validate that all city IDs exist in the database
          const cityValidation = await validateCityIds(cityIds);
          if (!cityValidation.isValid) {
            return NextResponse.json({
              isValid: false,
              errorMessage: cityValidation.errorMessage
            });
          }

          const comparison = await compareRemoteAndLocal(remoteQuery, cityIds);
          
          return NextResponse.json({
            isValid: comparison.isValid,
            rowCount: comparison.rowCount,
            errorMessage: comparison.errorMessage,
            executionTime: comparison.executionTime,
            queryMismatch: comparison.queryMismatch,
            citiesValidated: cityIds.length,
            details: comparison.isValid 
              ? `Configuration matches: no changes needed`
              : `Configuration differences found - see details for impact`
          });

        } catch (error) {
          return NextResponse.json({
            isValid: false,
            errorMessage: `Failed to compare configurations: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      }

      default: {
        return NextResponse.json({
          isValid: false,
          errorMessage: `Unknown operation: ${operation}. Must be "validateRemote", "validateLocal", or "compare"`
        }, { status: 400 });
      }
    }
    
  } catch (error) {
    console.error('Error in validation API:', error);
    
    return NextResponse.json({
      isValid: false,
      errorMessage: error instanceof Error ? error.message : 'Validation failed due to an unexpected error'
    }, { status: 500 });
  }
} 
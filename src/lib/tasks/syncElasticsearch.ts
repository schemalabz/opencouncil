'use server';

import { SyncElasticsearchRequest, SyncElasticsearchResult } from '../apiTypes';
import { startTask } from './tasks';
import { compareRemoteAndLocal } from '../elasticsearch/validator';
import { ConnectorService } from '../elasticsearch/connector';

export const requestSyncElasticsearch = async (
  cityId: string,
  meetingId: string,
  jobType: 'full' | 'incremental',
  options: { force?: boolean, skipValidation?: boolean } = {}
) => {
  // Validate current configuration before sync (unless explicitly skipped)
  if (!options.skipValidation) {
    try {
      const connectorService = new ConnectorService();
      const config = await connectorService.getConnectorConfig();
      const cityIds = connectorService.extractCityIds(config);
      
      // Get the actual remote query to validate against
      const filteringConfig = config.filtering?.[0];
      const remoteQuery = filteringConfig?.active?.advanced_snippet?.value?.[0]?.query ||
                          filteringConfig?.draft?.advanced_snippet?.value?.[0]?.query;
      
      // Validate that the connector configuration will return results
      // and that the remote query matches our expected template
      if (!remoteQuery) {
        throw new Error('No remote query found in connector configuration. Please check the connector setup.');
      }
      
      const validation = await compareRemoteAndLocal(remoteQuery, cityIds);
      if (!validation.isValid) {
        let errorMessage = `Sync validation failed: ${validation.errorMessage}`;
        
        if (validation.queryMismatch) {
          errorMessage += '\n\nOptions to resolve:';
          errorMessage += '\n1. Use skipValidation: true to bypass this check';
          errorMessage += '\n2. Update the connector using the admin interface (/admin/elasticsearch)';
          errorMessage += '\n3. Use force: true to proceed with the existing remote query';
        } else {
          errorMessage += ' This sync would likely result in data loss. Use skipValidation: true to bypass this check if you\'re certain the configuration is correct.';
        }
        
        throw new Error(errorMessage);
      }
      
      console.log(`Sync validation passed: ${validation.rowCount} subjects will be synced from ${cityIds.length} cities`);
      
      if (validation.queryMismatch) {
        console.log('Note: Using validated remote query which matches our template structure');
      }
      
    } catch (validationError) {
      console.error('Sync validation failed:', validationError);
      
      // If validation fails and force is not enabled, throw the error
      if (!options.force) {
        throw validationError;
      }
      
      // If force is enabled, log warning but continue
      console.warn('Sync validation failed but continuing due to force option:', validationError);
    }
  }

  const requestBody: Omit<SyncElasticsearchRequest, 'callbackUrl'> = {
    job_type: jobType,
    trigger_method: 'on_demand',
  };

  await startTask(
    'syncElasticsearch',
    requestBody,
    meetingId,
    cityId,
    options
  );
};

export const handleSyncElasticsearchResult = async (
    taskId: string,
    result: SyncElasticsearchResult
    ) => {
    // For now, we just log the result.
    // In the future, we can add more logic here, like sending notifications.
    console.log(
        `Handling SyncElasticsearchResult for taskId: ${taskId}, result: ${JSON.stringify(
        result,
        null,
        2
        )}`
    );
}; 
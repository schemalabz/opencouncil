import { env } from '@/env.mjs';
import { buildSyncQuery, extractCityIdsFromQuery } from './queryTemplate';
import { ConnectorStatus } from '@/types/elasticsearch';

export interface ConnectorConfig {
  id: string;
  name: string;
  index_name: string;
  filtering?: Array<{
    domain: string;
    draft?: {
      advanced_snippet?: {
        updated_at: string;
        created_at: string;
        value: Array<{
          tables: string[];
          query: string;
        }>;
      };
      rules?: any[];
      validation?: {
        state: string;
        errors: any[];
      };
    };
    active?: {
      advanced_snippet?: {
        updated_at: string;
        created_at: string;
        value: Array<{
          tables: string[];
          query: string;
        }>;
      };
      rules?: any[];
      validation?: {
        state: string;
        errors: any[];
      };
    };
  }>;
  status?: string;
  last_seen?: string;
  service_type?: string;
  last_sync_status?: string;
  last_indexed_document_count?: number;
  last_deleted_document_count?: number;
}



/**
 * Service for managing Elasticsearch connector configurations
 * Handles getting current config and updating sync queries
 */
export class ConnectorService {
  private readonly connectorId = 'opencouncil-postgresql';
  
  constructor() {
    if (!env.ELASTICSEARCH_URL || !env.ELASTICSEARCH_API_KEY) {
      throw new Error('ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY must be set');
    }
  }

  /**
   * Makes a request to the Elasticsearch API
   */
  private async makeRequest(path: string, options: RequestInit = {}): Promise<any> {
    const url = `${env.ELASTICSEARCH_URL}${path}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ApiKey ${env.ELASTICSEARCH_API_KEY}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Elasticsearch API error: ${response.status} ${response.statusText} - ${errorBody}`);
      throw new Error(`Elasticsearch API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
  
  /**
   * Gets the current connector configuration from Elasticsearch
   */
  async getConnectorConfig(): Promise<ConnectorConfig> {
    try {
      const response = await this.makeRequest(`/_connector/${this.connectorId}`);
      return response;
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        throw new Error(`Connector '${this.connectorId}' not found. Please ensure the connector is properly configured.`);
      }
      throw new Error(`Failed to get connector configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Updates the connector's advanced sync query with new city IDs
   */
  async updateConnectorQuery(cityIds: string[]): Promise<void> {
    if (!cityIds || cityIds.length === 0) {
      throw new Error('At least one city ID must be provided');
    }
    
    try {
      const query = buildSyncQuery(cityIds);
      
      const filteringConfig = {
        advanced_snippet: {
          value: [
            {
              tables: ["Subject"],
              query: query
            }
          ]
        }
      };
      
      await this.makeRequest(`/_connector/${this.connectorId}/_filtering`, {
        method: 'PUT',
        body: JSON.stringify(filteringConfig)
      });
      
    } catch (error) {
      throw new Error(`Failed to update connector query: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Extracts city IDs from the connector configuration
   */
  extractCityIds(config: ConnectorConfig): string[] {
    try {
      // Get the first (default) filtering configuration
      const filteringConfig = config.filtering?.[0];
      if (!filteringConfig) {
        return [];
      }
      
      // Try to get the query from active configuration first, then draft
      const query = filteringConfig.active?.advanced_snippet?.value?.[0]?.query ||
                    filteringConfig.draft?.advanced_snippet?.value?.[0]?.query;
      
      if (!query) {
        return [];
      }
      
      return extractCityIdsFromQuery(query);
    } catch (error) {
      console.error('Error extracting city IDs from connector config:', error);
      return [];
    }
  }

  /**
   * Extracts the current SQL query from the connector configuration
   */
  extractCurrentQuery(config: ConnectorConfig): string | undefined {
    try {
      // Get the first (default) filtering configuration
      const filteringConfig = config.filtering?.[0];
      if (!filteringConfig) {
        return undefined;
      }
      
      // Try to get the query from active configuration first, then draft
      const query = filteringConfig.active?.advanced_snippet?.value?.[0]?.query ||
                    filteringConfig.draft?.advanced_snippet?.value?.[0]?.query;
      
      return query || undefined;
    } catch (error) {
      console.error('Error extracting query from connector config:', error);
      return undefined;
    }
  }
  
  /**
   * Gets the current connector status including city configuration
   */
  async getConnectorStatus(): Promise<ConnectorStatus> {
    try {
      const config = await this.getConnectorConfig();
      const currentCityIds = this.extractCityIds(config);
      const currentQuery = this.extractCurrentQuery(config);
      
      return {
        currentCityIds,
        currentQuery,
        isValid: currentCityIds.length > 0,
        isConnected: !!config.last_seen,
        lastSeen: config.last_seen,
        status: config.status
      };
    } catch (error) {
      console.error('Error getting connector status:', error);
      return {
        currentCityIds: [],
        currentQuery: undefined,
        isValid: false,
        isConnected: false,
        status: 'error'
      };
    }
  }
  
  /**
   * Checks if the connector is properly connected and configured
   */
  async isConnectorHealthy(): Promise<boolean> {
    try {
      const config = await this.getConnectorConfig();
      
      // Check if connector has been seen recently (within last hour)
      if (config.last_seen) {
        const lastSeen = new Date(config.last_seen);
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        return lastSeen > oneHourAgo;
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Gets connector sync job status
   */
  async getLatestSyncJob(): Promise<any> {
    try {
      const queryParams = new URLSearchParams({
        connector_id: this.connectorId,
        size: '1'
      });
      
      const response = await this.makeRequest(`/_connector/_sync_job?${queryParams}`);
      return response?.results?.[0] || null;
    } catch (error) {
      console.error('Error getting sync job status:', error);
      return null;
    }
  }
} 
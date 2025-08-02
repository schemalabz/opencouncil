import { useState, useCallback } from 'react';
import { ConnectorStatus, ValidationResult } from '@/types/elasticsearch';
import { CityMinimalWithCounts } from '@/lib/db/cities';

export function useElasticsearchConnector() {
  const [cities, setCities] = useState<CityMinimalWithCounts[]>([]);
  const [connectorInfo, setConnectorInfo] = useState<ConnectorStatus | null>(null);
  const [selectedCityIds, setSelectedCityIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Remote validation (current/live configuration)
  const [isValidatingRemote, setIsValidatingRemote] = useState(false);
  const [remoteValidation, setRemoteValidation] = useState<ValidationResult | null>(null);
  const [remoteValidationComplete, setRemoteValidationComplete] = useState(false);
  
  // Local validation (proposed/editing configuration)
  const [isValidatingLocal, setIsValidatingLocal] = useState(false);
  const [localValidation, setLocalValidation] = useState<ValidationResult | null>(null);
  
  // Comparison (proposed vs remote configuration)
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<ValidationResult | null>(null);
  
  const [error, setError] = useState<string | null>(null);

  // Validates current/remote configuration (what's live in Elasticsearch)
  const validateRemoteConfiguration = useCallback(async () => {
    setIsValidatingRemote(true);
    try {
      const response = await fetch('/api/admin/elasticsearch/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          operation: 'validateRemote'
        })
      });
      
      const result = await response.json();
      setRemoteValidation(result);
    } catch (err) {
      setRemoteValidation({
        isValid: false,
        errorMessage: err instanceof Error ? err.message : 'Remote validation failed'
      });
    } finally {
      setIsValidatingRemote(false);
      setRemoteValidationComplete(true);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      setRemoteValidationComplete(false);
      
      const [citiesRes, connectorRes] = await Promise.all([
        fetch('/api/cities/all'),
        fetch('/api/admin/elasticsearch/connector')
      ]);
      
      if (!citiesRes.ok) {
        throw new Error('Failed to fetch cities');
      }
      
      if (!connectorRes.ok) {
        throw new Error('Failed to fetch connector status');
      }
      
      const citiesData = await citiesRes.json();
      const connectorData = await connectorRes.json();
      
      setCities(citiesData);
      setConnectorInfo(connectorData);
      setSelectedCityIds(connectorData.currentCityIds || []);
      
      // Auto-validate current remote configuration (regardless of city count)
      await validateRemoteConfiguration();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      setRemoteValidationComplete(true);
    }
  }, [validateRemoteConfiguration]);

  // Validates proposed/local configuration (what user is editing)
  const validateLocalConfiguration = useCallback(async (cityIds: string[]) => {
    if (cityIds.length === 0) {
      setLocalValidation({
        isValid: false,
        errorMessage: 'At least one city must be selected'
      });
      return;
    }
    
    setIsValidatingLocal(true);
    try {
      const response = await fetch('/api/admin/elasticsearch/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          operation: 'validateLocal',
          cityIds
        })
      });
      
      const result = await response.json();
      setLocalValidation(result);
    } catch (err) {
      setLocalValidation({
        isValid: false,
        errorMessage: err instanceof Error ? err.message : 'Local validation failed'
      });
    } finally {
      setIsValidatingLocal(false);
    }
  }, []);

  // Compares remote and local configurations to show differences
  const compareConfigurations = useCallback(async (cityIds: string[]) => {
    if (cityIds.length === 0) {
      setComparisonResult({
        isValid: false,
        errorMessage: 'At least one city must be selected'
      });
      return;
    }
    
    setIsComparing(true);
    try {
      const response = await fetch('/api/admin/elasticsearch/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          operation: 'compare',
          cityIds
        })
      });
      
      const result = await response.json();
      setComparisonResult(result);
    } catch (err) {
      setComparisonResult({
        isValid: false,
        errorMessage: err instanceof Error ? err.message : 'Comparison failed'
      });
    } finally {
      setIsComparing(false);
    }
  }, []);

  const applyConfiguration = useCallback(async () => {
    setIsLoading(true);
    try {
      // First validate in 'update' mode to ensure the template query is valid
      const updateValidationResponse = await fetch('/api/admin/elasticsearch/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          cityIds: selectedCityIds,
          mode: 'update'
        })
      });
      
      const updateValidation = await updateValidationResponse.json();
      
      if (!updateValidation.isValid) {
        throw new Error(`Configuration update validation failed: ${updateValidation.errorMessage}`);
      }
      
      // If validation passes, apply the configuration
      const response = await fetch('/api/admin/elasticsearch/connector', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cityIds: selectedCityIds })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update configuration');
      }
      
      // Reload data to show updated state
      await loadData();
      // Clear local validation after successful apply
      setLocalValidation(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update configuration');
    } finally {
      setIsLoading(false);
    }
  }, [selectedCityIds, loadData]);

  const updateSelectedCities = useCallback((cityIds: string[]) => {
    setSelectedCityIds(cityIds);
    // Clear both validation and comparison when cities change
    setLocalValidation(null);
    setComparisonResult(null);
  }, []);

  const hasChanges = JSON.stringify(selectedCityIds.sort()) !== JSON.stringify((connectorInfo?.currentCityIds || []).sort());

  return {
    // State
    cities,
    connectorInfo,
    selectedCityIds,
    isLoading,
    error,
    hasChanges,
    
    // Remote validation (current/live configuration)
    isValidatingRemote,
    remoteValidation,
    remoteValidationComplete,
    
    // Local validation (proposed/editing configuration)  
    isValidatingLocal,
    localValidation,
    
    // Comparison (proposed vs remote configuration)
    isComparing,
    comparisonResult,
    
    // Actions
    loadData,
    validateRemoteConfiguration,
    validateLocalConfiguration,
    compareConfigurations,
    applyConfiguration,
    updateSelectedCities,
  };
} 
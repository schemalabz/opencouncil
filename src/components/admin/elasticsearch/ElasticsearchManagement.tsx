'use client';

import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { XCircle } from 'lucide-react';
import ElasticsearchStatus from './Status';
import ConnectorStatusCard from './ConnectorStatusCard';
import ConfigurationEditDialog from './ConfigurationEditDialog';
import { useElasticsearchConnector } from '@/hooks/useElasticsearchConnector';
import { CityMinimalWithCounts } from '@/lib/db/cities';

export default function ElasticsearchManagement() {
  const {
    cities,
    connectorInfo,
    selectedCityIds,
    isLoading,
    error,
    hasChanges,
    
    // Remote validation (current system health)
    isValidatingRemote,
    remoteValidation,
    remoteValidationComplete,
    
    // Local validation (proposed configuration)
    isValidatingLocal,
    localValidation,
    
    // Comparison (proposed vs remote configuration)
    isComparing,
    comparisonResult,
    
    // Actions
    loadData,
    validateLocalConfiguration,
    compareConfigurations,
    applyConfiguration,
    updateSelectedCities,
  } = useElasticsearchConnector();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Load initial data
  useEffect(() => {
    loadData();
  }, [loadData]); // Load on mount

  useEffect(() => {
    if (!isDialogOpen) {
      loadData();
    }
  }, [isDialogOpen, loadData]); // Load when dialog closes

  const handleEditConfiguration = () => {
    setIsDialogOpen(true);
  };

  const handleApplyEdit = async () => {
    try {
      await applyConfiguration();
    } catch (error) {
      // Error handling is already managed by the hook
      console.error('Failed to apply configuration:', error);
    }
  };
  
  return (
    <div className="space-y-6">
      <ConnectorStatusCard
        connectorInfo={connectorInfo}
        remoteValidation={remoteValidation}
        cities={cities}
        isInitialLoading={!remoteValidationComplete}
        isValidatingRemote={isValidatingRemote}
        remoteValidationComplete={remoteValidationComplete}
        onEditConfiguration={handleEditConfiguration}
      />
      
      <ElasticsearchStatus />
      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      <ConfigurationEditDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        cities={cities}
        connectorInfo={connectorInfo}
        selectedCityIds={selectedCityIds}
        localValidation={localValidation}
        isValidatingLocal={isValidatingLocal}
        comparisonResult={comparisonResult}
        isComparing={isComparing}
        isLoading={isLoading}
        hasChanges={hasChanges}
        onApply={handleApplyEdit}
        onValidateLocal={validateLocalConfiguration}
        onCompareConfigurations={compareConfigurations}
        updateSelectedCities={updateSelectedCities}
      />
    </div>
  );
} 
'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Code,
  Clock
} from 'lucide-react';
import { buildSyncQuery } from '@/lib/elasticsearch/queryTemplate';
import Combobox from '@/components/Combobox';
import DocumentPreview from './DocumentPreview';
import { ConnectorStatus, ValidationResult } from '@/types/elasticsearch';
import { CityMinimalWithCounts } from '@/lib/db/cities';

interface ConfigurationEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cities: CityMinimalWithCounts[];
  connectorInfo: ConnectorStatus | null;
  selectedCityIds: string[];
  localValidation: ValidationResult | null;
  isValidatingLocal: boolean;
  comparisonResult: ValidationResult | null;
  isComparing: boolean;
  isLoading: boolean;
  hasChanges: boolean;
  onCitySelect: (city: CityMinimalWithCounts | null) => void;
  onCityRemove: (cityId: string) => void;
  onSelectAll: () => void;
  onApply: () => Promise<void>;
  onCancel: () => void;
  onValidateLocal: (cityIds: string[]) => Promise<void>;
  onCompareConfigurations: (cityIds: string[]) => Promise<void>;
  updateSelectedCities: (cityIds: string[]) => void;
}

export default function ConfigurationEditDialog({
  open,
  onOpenChange,
  cities,
  connectorInfo,
  selectedCityIds,
  localValidation,
  isValidatingLocal,
  comparisonResult,
  isComparing,
  isLoading,
  hasChanges,
  onCitySelect,
  onCityRemove,
  onSelectAll,
  onApply,
  onCancel,
  onValidateLocal,
  onCompareConfigurations,
  updateSelectedCities,
}: ConfigurationEditDialogProps) {
  const [selectedCity, setSelectedCity] = useState<CityMinimalWithCounts | null>(null);
  const [showQueryPreview, setShowQueryPreview] = useState(false);

  // Helper function to check if there are actual query differences
  const hasQueryDifferences = () => {
    return comparisonResult && 
           !comparisonResult.isValid && 
           comparisonResult.queryMismatch && 
           (!comparisonResult.queryMismatch.structureMatches || !comparisonResult.queryMismatch.cityIdsMatch);
  };

  // Trigger both validation and comparison when dialog opens or cities change
  useEffect(() => {
    if (open && selectedCityIds.length > 0) {
      // Run validation and comparison in parallel
      Promise.all([
        onValidateLocal(selectedCityIds),
        onCompareConfigurations(selectedCityIds)
      ]);
    }
  }, [open, selectedCityIds, onValidateLocal, onCompareConfigurations]);

  const handleCitySelect = (city: CityMinimalWithCounts | null) => {
    onCitySelect(city);
    setSelectedCity(null);
  };

  const getSelectedCities = () => {
    return cities.filter(city => selectedCityIds.includes(city.id));
  };

  const getAvailableCities = () => {
    return cities.filter(city => !selectedCityIds.includes(city.id));
  };

  const handleApply = async () => {
    await onApply();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure Search Index</DialogTitle>
          <DialogDescription>
            Choose which cities&apos; council meetings and documents will be searchable.
            We&apos;ll validate your selection and update the search system accordingly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* City Selection */}
          <div>
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Choose Cities</h3>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={onSelectAll}
                  disabled={cities.length === 0}
                >
                  {selectedCityIds.length === cities.length ? 'Clear All' : 'Select All'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Select cities whose council meetings and documents will be searchable by users.
              </p>
            </div>
            
            {/* Combobox for adding cities */}
            <div className="mb-4">
              <Combobox
                items={getAvailableCities()}
                value={selectedCity}
                onChange={handleCitySelect}
                placeholder="Search and select cities to add..."
                searchPlaceholder="Search cities..."
                getItemLabel={(city) => city.name}
                getItemValue={(city) => city.name}
                disabled={cities.length === 0}
                className="w-full"
              />
            </div>

            {/* Selected Cities Display */}
            {selectedCityIds.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2">Selected Cities:</div>
                <div className="flex flex-wrap gap-2">
                  {getSelectedCities().map(city => (
                    <Badge 
                      key={city.id} 
                      variant="secondary" 
                      className="flex items-center gap-2 px-3 py-1"
                    >
                      <span>{city.name}</span>
                      {connectorInfo?.currentCityIds.includes(city.id) && (
                        <span className="text-xs bg-green-100 text-green-700 px-1 rounded">
                          Active
                        </span>
                      )}
                      <button
                        onClick={() => onCityRemove(city.id)}
                        className="ml-1 hover:bg-gray-200 rounded-full p-0.5 transition-colors"
                        aria-label={`Remove ${city.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {cities.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-gray-50 rounded-md">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading available cities...</span>
              </div>
            )}
          </div>
          
          {/* Selection Summary */}
          {selectedCityIds.length > 0 && (
            <div className="text-sm p-3 bg-blue-50 rounded-md border border-blue-200">
              <div className="flex items-center justify-between">
                <div className="text-blue-900">
                  <strong>{selectedCityIds.length}</strong> of {cities.length} cities will be searchable
                </div>
                {hasChanges && (
                  <Badge variant="outline" className="text-orange-700 border-orange-300 bg-orange-50">
                    Changes pending
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Query Preview Section */}
          {selectedCityIds.length > 0 && (
            <div className="border-t pt-4">
              <div className="mb-3">
                <h3 className="text-sm font-semibold mb-1">Technical Preview (Optional)</h3>
                <p className="text-xs text-muted-foreground mb-2">
                  View the SQL query and sample documents that will be generated for your city selection.
                </p>
              </div>
              
              <button
                onClick={() => setShowQueryPreview(!showQueryPreview)}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {showQueryPreview ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                <Code className="h-4 w-4" />
                {showQueryPreview ? 'Hide' : 'Show'} SQL Queries
              </button>
              
              {showQueryPreview && (
                <div className="mt-3 space-y-4">
                  <div className="text-xs text-muted-foreground">
                    Compare the current configuration with your proposed changes.
                  </div>

                  {/* Current Configuration Query */}
                  {connectorInfo?.currentQuery && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-sm font-medium">Current Configuration Query</h4>
                        <Badge variant="outline" className="text-xs">
                          {connectorInfo.currentCityIds.length} cities
                        </Badge>
                      </div>
                      <div className="bg-blue-50 p-3 rounded-md overflow-x-auto">
                        <pre className="text-xs whitespace-pre-wrap text-blue-900">
                          {connectorInfo.currentQuery}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Proposed Query */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-sm font-medium">
                        {hasChanges ? 'Proposed Configuration Query' : 'Generated Query Preview'}
                      </h4>
                      <Badge variant={hasChanges ? "default" : "secondary"} className="text-xs">
                        {selectedCityIds.length} cities
                      </Badge>
                      {hasChanges && (
                        <Badge variant="outline" className="text-xs text-orange-600">
                          Changes pending
                        </Badge>
                      )}
                    </div>
                    <div className={`p-3 rounded-md overflow-x-auto ${hasChanges ? 'bg-green-50' : 'bg-gray-50'}`}>
                      <pre className={`text-xs whitespace-pre-wrap ${hasChanges ? 'text-green-900' : 'text-gray-900'}`}>
                        {(() => {
                          try {
                            return buildSyncQuery(selectedCityIds);
                          } catch (error) {
                            return `Error generating query: ${error instanceof Error ? error.message : 'Unknown error'}`;
                          }
                        })()}
                      </pre>
                    </div>
                  </div>

                  {/* Show comparison info if queries differ */}
                  {connectorInfo?.currentQuery && hasChanges && (
                    <div className="p-3 bg-yellow-50 rounded-md">
                      <div className="text-sm text-yellow-800 font-medium mb-1">Query Comparison</div>
                      <div className="text-xs text-yellow-700 space-y-1">
                        <div>• <strong>Current:</strong> {connectorInfo.currentCityIds.length} cities configured</div>
                        <div>• <strong>Proposed:</strong> {selectedCityIds.length} cities selected</div>
                        <div className="mt-2 text-xs">
                          The proposed query will replace the current configuration when you apply changes.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Show mismatch info if available from validation */}
                  {localValidation?.queryMismatch && !localValidation.queryMismatch.structureMatches && (
                    <div className="p-3 bg-orange-50 rounded-md">
                      <div className="text-sm text-orange-800 font-medium mb-1">Query Structure Mismatch Detected</div>
                      <div className="text-xs text-orange-700">
                        The current remote query structure differs from the expected template. 
                        Applying the configuration will update it to match the standard format.
                      </div>
                    </div>
                  )}

                  <DocumentPreview 
                    selectedCityIds={selectedCityIds}
                    cities={cities}
                    connectorInfo={connectorInfo}
                  />
                </div>
              )}
            </div>
          )}
          
          {/* Configuration Status */}
          <div className="border rounded-lg p-4 bg-gray-50">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold">Configuration Status</h3>
              {(isValidatingLocal || isComparing) && (
                <Clock className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            
            {(isValidatingLocal || isComparing) ? (
              <div className="space-y-2">
                {isValidatingLocal && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    Validating proposed configuration...
                  </div>
                )}
                {isComparing && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                    Comparing with remote configuration...
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Validation Status */}
                {localValidation && (
                  <div className="flex items-start gap-3">
                    {localValidation.isValid ? (
                      <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <div className="text-sm font-medium">
                        {localValidation.isValid ? 'Configuration Valid' : 'Configuration Issue'}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {localValidation.isValid ? localValidation.details : localValidation.errorMessage}
                      </div>
                    </div>
                  </div>
                )}

                {/* Comparison Status */}
                {hasQueryDifferences() && (
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">Remote Query Needs Update</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {!comparisonResult?.queryMismatch?.structureMatches && !comparisonResult?.queryMismatch?.cityIdsMatch
                          ? 'Both query structure and city selection differ from remote configuration.'
                          : !comparisonResult?.queryMismatch?.structureMatches
                          ? 'Query structure differs from expected template.'
                          : 'City selection differs from remote configuration.'}
                      </div>
                      <div className="text-xs text-orange-600 mt-2">
                        Apply configuration to sync remote system with your settings.
                      </div>
                    </div>
                  </div>
                )}

                {/* All Good Status */}
                {localValidation?.isValid && !hasQueryDifferences() && !hasChanges && (
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">Everything Looks Good</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Your configuration is valid and matches the remote system.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Actions */}
          <div className="pt-4 border-t space-y-3">
            {/* Action Status/Guidance */}
            <div className="text-sm text-muted-foreground">
              {selectedCityIds.length === 0 ? (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Select at least one city to continue.</span>
                </div>
              ) : isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Updating connector configuration...</span>
                </div>
              ) : localValidation && !localValidation.isValid ? (
                <div className="flex items-center gap-2 text-red-600">
                  <XCircle className="h-4 w-4" />
                  <span>Please fix configuration issues before applying.</span>
                </div>
              ) : hasChanges || hasQueryDifferences() ? (
                <div className="flex items-center gap-2 text-blue-600">
                  <CheckCircle className="h-4 w-4" />
                  <span>Ready to apply {hasChanges ? 'city changes' : 'query structure updates'} to the connector.</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  <span>Configuration is up to date. No changes needed.</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline"
                onClick={handleCancel}
                disabled={isLoading}
              >
                Cancel
              </Button>
              
              <Button 
                onClick={handleApply}
                disabled={selectedCityIds.length === 0 || isLoading || (localValidation && !localValidation.isValid) || (!hasChanges && !hasQueryDifferences())}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Applying Changes...
                  </>
                                  ) : hasChanges && hasQueryDifferences() ? (
                    'Apply Cities & Update Query'
                  ) : hasChanges ? (
                    'Apply City Changes'
                  ) : hasQueryDifferences() ? (
                    'Update Query Structure'
                  ) : (
                  'Apply Configuration'
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 
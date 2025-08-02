'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle, XCircle, AlertTriangle, Clock, Database, ChevronDown, ChevronUp, Code, Edit2 } from 'lucide-react';
import { ConnectorStatus, ValidationResult } from '@/types/elasticsearch';
import { format } from 'date-fns';
import { CityMinimalWithCounts } from '@/lib/db/cities';

interface ConnectorStatusCardProps {
  connectorInfo: ConnectorStatus | null;
  remoteValidation: ValidationResult | null;
  cities: CityMinimalWithCounts[];
  isInitialLoading: boolean;
  isValidatingRemote: boolean;
  remoteValidationComplete: boolean;
  onEditConfiguration?: () => void;
}

const ConnectionHealth = ({ connectorInfo }: { connectorInfo: ConnectorStatus | null }) => {
  const [showQuery, setShowQuery] = useState(false);

  if (!connectorInfo) {
    return <Skeleton className="h-4 w-3/4" />;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Connection Health</h4>
        <div className="flex items-center gap-2">
          {connectorInfo.isConnected ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
          <span className={`text-sm ${connectorInfo.isConnected ? 'text-green-700' : 'text-red-700'}`}>
            {connectorInfo.isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>
      
      {connectorInfo.lastSeen && (
        <div className="text-xs text-muted-foreground">
          Last seen: {format(new Date(connectorInfo.lastSeen), 'PPP p')}
        </div>
      )}
      
      {connectorInfo.status && (
        <div className="text-xs text-muted-foreground">
          Status: {connectorInfo.status}
        </div>
      )}

      {/* Query Display */}
      {connectorInfo.currentQuery && (
        <div>
          <button
            onClick={() => setShowQuery(!showQuery)}
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left"
          >
            {showQuery ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            <Code className="h-3 w-3" />
            {showQuery ? 'Hide' : 'Show'} Current SQL Query
          </button>
          
          {showQuery && (
            <div className="mt-2 p-3 bg-blue-50 rounded-md overflow-x-auto">
              <pre className="text-xs whitespace-pre-wrap text-blue-900">
                {connectorInfo.currentQuery}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ActiveConfiguration = ({ 
  connectorInfo, 
  remoteValidation, 
  cities, 
  isValidatingRemote, 
  remoteValidationComplete,
  onEditConfiguration
}: { 
  connectorInfo: ConnectorStatus | null;
  remoteValidation: ValidationResult | null;
  cities: CityMinimalWithCounts[];
  isValidatingRemote: boolean;
  remoteValidationComplete: boolean;
  onEditConfiguration?: () => void;
}) => {
  if (!connectorInfo) {
    return <Skeleton className="h-16 w-full" />;
  }

  const configuredCities = cities.filter(city => 
    connectorInfo.currentCityIds.includes(city.id)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Active Configuration</h4>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {connectorInfo.currentCityIds.length} cities
          </Badge>
          {connectorInfo.currentCityIds.length > 0 && onEditConfiguration && (
            <Button
              variant="outline"
              size="sm"
              onClick={onEditConfiguration}
              className="h-7 px-2 text-xs"
            >
              <Edit2 className="h-3 w-3 mr-1" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {connectorInfo.currentCityIds.length === 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">No cities configured</span>
          </div>
          {onEditConfiguration && (
            <Button
              variant="default"
              size="sm"
              onClick={onEditConfiguration}
              className="w-full"
            >
              <Edit2 className="h-4 w-4 mr-2" />
              Configure Cities
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Cities Display */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Configured Cities:</div>
            <div className="flex flex-wrap gap-1">
              {configuredCities.map(city => (
                <Badge key={city.id} variant="secondary" className="text-xs">
                  {city.name}
                </Badge>
              ))}
            </div>
          </div>

          {/* Current System Health Status */}
          <div className="p-3 rounded-md bg-gray-50">
            {!remoteValidationComplete || isValidatingRemote ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4 animate-spin" />
                <span className="text-sm">Checking current system health...</span>
              </div>
            ) : remoteValidation ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {remoteValidation.isValid ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className={`text-sm font-medium ${
                    remoteValidation.isValid ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {remoteValidation.isValid ? 'Current System Healthy' : 'Current System Issues'}
                  </span>
                </div>
                
                {remoteValidation.isValid && remoteValidation.rowCount !== undefined && (
                  <div className="text-xs text-muted-foreground">
                    {remoteValidation.rowCount} subjects currently indexed
                    {remoteValidation.executionTime && (
                      <span> • Verified in {remoteValidation.executionTime}ms</span>
                    )}
                  </div>
                )}
                
                {!remoteValidation.isValid && remoteValidation.errorMessage && (
                  <div className="text-xs text-red-600 mt-1">
                    Current system issue: {remoteValidation.errorMessage}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">System health check pending</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default function ConnectorStatusCard({
  connectorInfo,
  remoteValidation,
  cities,
  isInitialLoading,
  isValidatingRemote,
  remoteValidationComplete,
  onEditConfiguration,
}: ConnectorStatusCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Connector Status
        </CardTitle>
        <div className="text-sm text-muted-foreground">
          Current system health and live configuration status of the Elasticsearch connector.
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <ConnectionHealth connectorInfo={connectorInfo} />
        <ActiveConfiguration 
          connectorInfo={connectorInfo}
          remoteValidation={remoteValidation}
          cities={cities}
          isValidatingRemote={isValidatingRemote}
          remoteValidationComplete={remoteValidationComplete}
          onEditConfiguration={onEditConfiguration}
        />
      </CardContent>
    </Card>
  );
} 
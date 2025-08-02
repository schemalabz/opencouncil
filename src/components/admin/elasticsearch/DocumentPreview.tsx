'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, XCircle, Eye, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { ConnectorStatus } from '@/types/elasticsearch';
import { CityMinimalWithCounts } from '@/lib/db/cities';

export interface DocumentPreview {
    success: boolean;
    query: string;
    sampleDocuments: any[];
    sampleCount: number;
    totalDocuments: number;
    executionTime: number;
    cityIds: string[];
    filters: {
      cityId: string | null;
      meetingId: string | null;
      subjectId: string | null;
    };
    error?: string;
    details?: string;
  } 

interface DocumentPreviewProps {
  selectedCityIds: string[];
  cities: CityMinimalWithCounts[];
  connectorInfo: ConnectorStatus | null;
}

export default function DocumentPreview({ selectedCityIds, cities, connectorInfo }: DocumentPreviewProps) {
  const [documentPreview, setDocumentPreview] = useState<DocumentPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  
  // Filter inputs
  const [specificCityId, setSpecificCityId] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [limit, setLimit] = useState(3);

  const previewDocuments = async () => {
    if (selectedCityIds.length === 0) {
      return;
    }
    
    setIsLoadingPreview(true);
    try {
      const response = await fetch('/api/admin/elasticsearch/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          cityIds: selectedCityIds, 
          limit,
          cityId: specificCityId || undefined,
          meetingId: meetingId || undefined,
          subjectId: subjectId || undefined
        })
      });
      
      const result = await response.json();
      setDocumentPreview(result);
      if (result.success) {
        setShowDocumentPreview(true);
      }
    } catch (err) {
      setDocumentPreview({
        success: false,
        error: 'Failed to preview documents',
        details: err instanceof Error ? err.message : 'Unknown error',
        query: '',
        sampleDocuments: [],
        sampleCount: 0,
        totalDocuments: 0,
        executionTime: 0,
        cityIds: selectedCityIds,
        filters: {
          cityId: null,
          meetingId: null,
          subjectId: null
        }
      });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const clearFilters = () => {
    setSpecificCityId('');
    setMeetingId('');
    setSubjectId('');
    setLimit(3);
  };

  const hasFilters = specificCityId || meetingId || subjectId;

  return (
    <div className="border-t pt-4">
      <div className="mb-3">
        <h4 className="text-sm font-medium text-gray-900 mb-1">Document Structure Preview</h4>
        <p className="text-xs text-muted-foreground">
          Execute the sync query and see sample documents that will be created in Elasticsearch.
        </p>
      </div>

      {/* Filter Controls */}
      <div className="bg-gray-50 p-4 rounded-md mb-4">
        <div className="flex items-center justify-between mb-3">
          <h5 className="text-sm font-medium text-gray-800">Preview Filters (Optional)</h5>
          {hasFilters && (
            <Button
              onClick={clearFilters}
              variant="ghost"
              size="sm"
              className="text-xs"
            >
              Clear Filters
            </Button>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <div>
            <Label htmlFor="specific-city" className="text-xs">Specific City</Label>
            <Input
              id="specific-city"
              placeholder="e.g., athens"
              value={specificCityId}
              onChange={(e) => setSpecificCityId(e.target.value)}
              className="text-xs"
            />
          </div>
          
          <div>
            <Label htmlFor="meeting-id" className="text-xs">Meeting ID</Label>
            <Input
              id="meeting-id"
              placeholder="e.g., meeting-123"
              value={meetingId}
              onChange={(e) => setMeetingId(e.target.value)}
              className="text-xs"
            />
          </div>
          
          <div>
            <Label htmlFor="subject-id" className="text-xs">Subject ID</Label>
            <Input
              id="subject-id"
              placeholder="e.g., subject-456"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="text-xs"
            />
          </div>
          
          <div>
            <Label htmlFor="limit" className="text-xs">Sample Size</Label>
            <Input
              id="limit"
              type="number"
              min="1"
              max="10"
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value) || 3)}
              className="text-xs"
            />
          </div>
        </div>
        
        <div className="text-xs text-muted-foreground">
          Use filters to preview specific documents. Leave empty to see random samples from your selected cities.
        </div>
      </div>

      {/* Preview Button */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-muted-foreground">
          {hasFilters ? (
            <span>Preview with filters applied</span>
          ) : (
            <span>Preview random samples from {selectedCityIds.length} selected cities</span>
          )}
        </div>
        <Button
          onClick={previewDocuments}
          disabled={selectedCityIds.length === 0 || isLoadingPreview}
          variant="outline"
          size="sm"
        >
          {isLoadingPreview ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <Eye className="h-4 w-4 mr-2" />
              Preview Documents
            </>
          )}
        </Button>
      </div>

      {/* Document Preview Results */}
      {documentPreview && (
        <div className="space-y-3">
          {documentPreview.success ? (
            <>
              {/* Summary */}
              <div className="bg-green-50 p-3 rounded-md">
                <div className="flex items-center gap-2 text-green-800 text-sm font-medium mb-1">
                  <CheckCircle className="h-4 w-4" />
                  Query executed successfully
                </div>
                <div className="text-xs text-green-700 space-y-1">
                  <div>• Found <strong>{documentPreview.totalDocuments}</strong> total documents</div>
                  <div>• Showing <strong>{documentPreview.sampleCount}</strong> sample documents</div>
                  <div>• Query executed in <strong>{documentPreview.executionTime}ms</strong></div>
                  {(documentPreview.filters.cityId || documentPreview.filters.meetingId || documentPreview.filters.subjectId) && (
                    <div className="text-green-600 font-medium">
                      • Filters applied: {[
                        documentPreview.filters.cityId && `City: ${documentPreview.filters.cityId}`,
                        documentPreview.filters.meetingId && `Meeting: ${documentPreview.filters.meetingId}`,
                        documentPreview.filters.subjectId && `Subject: ${documentPreview.filters.subjectId}`
                      ].filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>
              </div>

              {/* Sample Documents */}
              {documentPreview.sampleDocuments.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowDocumentPreview(!showDocumentPreview)}
                    className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
                  >
                    {showDocumentPreview ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                    <FileText className="h-4 w-4" />
                    {showDocumentPreview ? 'Hide' : 'Show'} Sample Documents
                  </button>

                  {showDocumentPreview && (
                    <div className="space-y-3">
                      {documentPreview.sampleDocuments.map((doc: any, index: number) => (
                        <div key={index} className="bg-gray-50 p-3 rounded-md">
                          <div className="text-xs text-muted-foreground mb-2">
                            Document {index + 1} - Subject ID: {doc.id}
                          </div>
                          <div className="space-y-2">
                            {/* Key fields preview */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                              <div>
                                <span className="font-medium">Title:</span>
                                <div className="text-muted-foreground mt-1 truncate">
                                  {doc.name || 'No title'}
                                </div>
                              </div>
                              <div>
                                <span className="font-medium">City:</span>
                                <div className="text-muted-foreground mt-1">
                                  {doc.city_name || 'Unknown'}
                                </div>
                              </div>
                              <div>
                                <span className="font-medium">Meeting Date:</span>
                                <div className="text-muted-foreground mt-1">
                                  {doc.meeting_date ? new Date(doc.meeting_date).toLocaleDateString() : 'No date'}
                                </div>
                              </div>
                              <div>
                                <span className="font-medium">Speaker Segments:</span>
                                <div className="text-muted-foreground mt-1">
                                  {Array.isArray(doc.speaker_segments) ? doc.speaker_segments.length : 0} segments
                                </div>
                              </div>
                              <div>
                                <span className="font-medium">Meeting ID:</span>
                                <div className="text-muted-foreground mt-1 font-mono text-xs">
                                  {doc.councilmeeting_id || 'No meeting ID'}
                                </div>
                              </div>
                              <div>
                                <span className="font-medium">Topic:</span>
                                <div className="text-muted-foreground mt-1">
                                  {doc.topic_name || 'No topic'}
                                </div>
                              </div>
                            </div>
                            
                            {/* Full document structure toggle */}
                            <details className="mt-2">
                              <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-800">
                                View complete document structure (JSON)
                              </summary>
                              <div className="mt-2 bg-white p-2 rounded border text-xs overflow-x-auto">
                                <pre className="whitespace-pre-wrap">
                                  {JSON.stringify(doc, null, 2)}
                                </pre>
                              </div>
                            </details>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Configuration Comparison */}
              <div className="border-t pt-3">
                <h5 className="text-xs font-medium mb-2">Configuration Comparison</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="font-medium text-blue-600">Currently in Elasticsearch:</span>
                    <div className="mt-1 text-muted-foreground">
                      {connectorInfo?.currentCityIds.length ? (
                        connectorInfo.currentCityIds.map(cityId => {
                          const city = cities.find(c => c.id === cityId);
                          return city ? city.name : cityId;
                        }).join(', ')
                      ) : (
                        'No cities configured'
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium text-green-600">Preview Selection:</span>
                    <div className="mt-1 text-muted-foreground">
                      {cities.filter(city => selectedCityIds.includes(city.id)).map(city => city.name).join(', ')}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-red-50 p-3 rounded-md">
              <div className="flex items-center gap-2 text-red-800 text-sm font-medium mb-1">
                <XCircle className="h-4 w-4" />
                Preview failed
              </div>
              <div className="text-xs text-red-700">
                {documentPreview.error}
                {documentPreview.details && (
                  <div className="mt-1 font-mono bg-red-100 p-2 rounded">
                    {documentPreview.details}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 
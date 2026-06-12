'use client';

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import CivicMap from '@/components/map/civic/CivicMap';
import type { MapOverlay, MapReferenceMarker } from '@/lib/map/types';
import { createCircleBuffer } from '@/lib/geo';

interface SubjectLocation {
    id: string;
    name: string;
    locationId: string;
    coordinates: [number, number];
}

interface UserPreferenceLocation {
    id: string;
    text: string;
    coordinates: [number, number];
}

interface MapData {
    subjectLocations: SubjectLocation[];
    userPreferenceLocations: UserPreferenceLocation[];
}

interface NotificationMapDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    meetingId: string;
    cityId: string;
    meetingName: string;
}

export function NotificationMapDialog({
    open,
    onOpenChange,
    meetingId,
    cityId,
    meetingName,
}: NotificationMapDialogProps) {
    const [mapData, setMapData] = useState<MapData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open && meetingId && cityId) {
            setLoading(true);
            setError(null);
            fetch(`/api/admin/notifications/map-data?meetingId=${meetingId}&cityId=${cityId}`)
                .then(res => res.json())
                .then((data: MapData) => {
                    setMapData(data);
                    setLoading(false);
                })
                .catch(err => {
                    console.error('Error fetching map data:', err);
                    setError('Failed to load map data');
                    setLoading(false);
                });
        }
    }, [open, meetingId, cityId]);

    // Notification radii as quiet overlays
    const overlays = useMemo<MapOverlay[]>(() => {
        if (!mapData) return [];
        return mapData.subjectLocations.flatMap(subject => [
            {
                id: `subject-${subject.id}-400m`,
                geometry: createCircleBuffer(subject.coordinates, 400),
                style: { fillColor: '#3B82F6', fillOpacity: 0.1, strokeColor: '#3B82F6', strokeWidth: 2 },
            },
            {
                id: `subject-${subject.id}-600m`,
                geometry: createCircleBuffer(subject.coordinates, 600),
                style: { fillColor: '#60A5FA', fillOpacity: 0.1, strokeColor: '#60A5FA', strokeWidth: 2 },
            },
        ]);
    }, [mapData]);

    // Subject + user preference locations as labeled dots
    const referenceMarkers = useMemo<MapReferenceMarker[]>(() => {
        if (!mapData) return [];
        return [
            ...mapData.subjectLocations.map(subject => ({
                id: `subject-${subject.id}`,
                coordinates: subject.coordinates,
                label: subject.name,
                color: '#1E40AF',
            })),
            ...mapData.userPreferenceLocations.map(location => ({
                id: `user-pref-${location.id}`,
                coordinates: location.coordinates,
                label: location.text,
                color: '#EF4444',
            })),
        ];
    }, [mapData]);

    // Fit all points
    const fitTarget = useMemo((): GeoJSON.Geometry | null => {
        if (referenceMarkers.length === 0) return null;
        return {
            type: 'GeometryCollection',
            geometries: referenceMarkers.map(marker => ({ type: 'Point' as const, coordinates: marker.coordinates })),
        };
    }, [referenceMarkers]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Map View: {meetingName}</DialogTitle>
                    <DialogDescription>
                        Showing {mapData?.subjectLocations.length || 0} subjects and {mapData?.userPreferenceLocations.length || 0} user preference locations
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-1 relative min-h-0">
                    {loading ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                        </div>
                    ) : error ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <p className="text-red-500">{error}</p>
                        </div>
                    ) : referenceMarkers.length === 0 ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <p className="text-gray-500">No location data available</p>
                        </div>
                    ) : (
                        <CivicMap
                            className="h-full w-full"
                            subjects={[]}
                            overlays={overlays}
                            referenceMarkers={referenceMarkers}
                            camera={{ fitTo: fitTarget, padding: 80 }}
                        />
                    )}
                </div>
                <div className="flex gap-4 text-sm text-gray-600 pt-2 border-t">
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-blue-800 border-2 border-blue-900"></div>
                        <span>Subject locations</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border-2 border-blue-500 bg-blue-500/10"></div>
                        <span>400m radius</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border-2 border-blue-400 bg-blue-400/10"></div>
                        <span>600m radius</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-red-500 border-2 border-red-700"></div>
                        <span>User preference locations</span>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}


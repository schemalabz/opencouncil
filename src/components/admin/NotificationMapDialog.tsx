'use client';

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import Map, { MapFeature } from '@/components/map/map';

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

// Helper function to create a circular polygon buffer around a point
function createCircleBuffer(center: [number, number], radiusInMeters: number): GeoJSON.Polygon {
    const earthRadius = 6371000; // Earth's radius in meters
    const lat = center[1] * Math.PI / 180; // Convert to radians
    const lng = center[0] * Math.PI / 180;

    const points: [number, number][] = [];
    const numPoints = 64; // Number of points to create the circle

    for (let i = 0; i < numPoints; i++) {
        const angle = (i * 360 / numPoints) * Math.PI / 180;

        // Calculate offset in radians
        const dLat = radiusInMeters * Math.cos(angle) / earthRadius;
        const dLng = radiusInMeters * Math.sin(angle) / (earthRadius * Math.cos(lat));

        // Convert back to degrees
        const newLat = (lat + dLat) * 180 / Math.PI;
        const newLng = (lng + dLng) * 180 / Math.PI;

        points.push([newLng, newLat]);
    }

    // Close the polygon by adding the first point at the end
    points.push(points[0]);

    return {
        type: 'Polygon',
        coordinates: [points]
    };
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

    // Build map features from the data
    const mapFeatures = useMemo(() => {
        if (!mapData) return [];

        const features: MapFeature[] = [];

        // Add subject locations with radius circles
        mapData.subjectLocations.forEach((subject) => {
            // Add 400m radius circle
            features.push({
                id: `subject-${subject.id}-400m`,
                geometry: createCircleBuffer(subject.coordinates, 400),
                style: {
                    fillColor: '#3B82F6',
                    fillOpacity: 0.1,
                    strokeColor: '#3B82F6',
                    strokeWidth: 2,
                },
            });

            // Add 600m radius circle
            features.push({
                id: `subject-${subject.id}-600m`,
                geometry: createCircleBuffer(subject.coordinates, 600),
                style: {
                    fillColor: '#60A5FA',
                    fillOpacity: 0.1,
                    strokeColor: '#60A5FA',
                    strokeWidth: 2,
                },
            });

            // Add subject point
            features.push({
                id: `subject-${subject.id}`,
                geometry: {
                    type: 'Point',
                    coordinates: subject.coordinates,
                },
                style: {
                    fillColor: '#1E40AF',
                    fillOpacity: 0.9,
                    strokeColor: '#1E3A8A',
                    strokeWidth: 4,
                    label: subject.name,
                },
            });
        });

        // Add user preference locations
        mapData.userPreferenceLocations.forEach((location) => {
            features.push({
                id: `user-pref-${location.id}`,
                geometry: {
                    type: 'Point',
                    coordinates: location.coordinates,
                },
                style: {
                    fillColor: '#EF4444',
                    fillOpacity: 0.8,
                    strokeColor: '#B91C1C',
                    strokeWidth: 3,
                    label: location.text,
                },
            });
        });

        return features;
    }, [mapData]);

    // Calculate center from features
    const mapCenter = useMemo(() => {
        if (!mapData || mapFeatures.length === 0) return undefined;

        const allCoords: [number, number][] = [
            ...mapData.subjectLocations.map(s => s.coordinates),
            ...mapData.userPreferenceLocations.map(l => l.coordinates),
        ];

        if (allCoords.length === 0) return undefined;

        const avgLng = allCoords.reduce((sum, coord) => sum + coord[0], 0) / allCoords.length;
        const avgLat = allCoords.reduce((sum, coord) => sum + coord[1], 0) / allCoords.length;

        return [avgLng, avgLat] as [number, number];
    }, [mapData, mapFeatures]);

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
                    ) : mapFeatures.length === 0 ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <p className="text-gray-500">No location data available</p>
                        </div>
                    ) : (
                        <Map
                            features={mapFeatures}
                            center={mapCenter}
                            zoom={13}
                            animateRotation={false}
                            pitch={0}
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


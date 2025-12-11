'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface CityStatus {
    cityId: string;
    cityName: string;
    latestMeetingIdPostgres: string | null;
    totalMeetingsPostgres: number;
    latestMeetingIdElastic: string | null;
    totalMeetingsElastic: number;
    totalSubjectsElastic: number;
    isInElastic: boolean;
    isListed: boolean;
}

interface ElasticsearchStatusData {
    lastSync: number;
    cities: CityStatus[];
}

const StatusIndicator = ({ inSync }: { inSync: boolean }) => {
    return inSync ? (
        <CheckCircle className="h-5 w-5 text-green-500" />
    ) : (
        <XCircle className="h-5 w-5 text-red-500" />
    );
};

export default function ElasticsearchStatus() {
    const [status, setStatus] = useState<ElasticsearchStatusData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showUnlisted, setShowUnlisted] = useState(false);

    useEffect(() => {
        async function fetchStatus() {
            try {
                const response = await fetch('/api/admin/elasticsearch/status');
                if (!response.ok) {
                    if (response.status === 403) {
                        throw new Error('Not authorized to view this data.');
                    }
                    throw new Error('Failed to fetch status from the server.');
                }
                const data = await response.json();
                if (data.error) {
                    throw new Error(data.error);
                }
                setStatus(data);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        fetchStatus();
    }, []);

    const filteredCities = status?.cities.filter(city => showUnlisted || city.isListed);

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Elasticsearch Sync Status</CardTitle>
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-4 w-1/2 mb-4" />
                    <div className="space-y-2">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Elasticsearch Sync Status</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center text-red-500">
                        <AlertTriangle className="h-5 w-5 mr-2" />
                        <p>{error}</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (!status) {
        return null;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Elasticsearch Sync Status (Released Meetings)</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 mb-4">
                    <div>
                        <p><strong>Last Updated:</strong> {status.lastSync ? format(new Date(status.lastSync), 'PPP p') : 'N/A'}</p>
                    </div>
                    <div className="flex items-center justify-end space-x-2">
                        <Switch
                            id="show-unlisted"
                            checked={showUnlisted}
                            onCheckedChange={setShowUnlisted}
                        />
                        <Label htmlFor="show-unlisted">Show Unlisted Cities</Label>
                    </div>
                </div>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead rowSpan={2} className="align-bottom">City</TableHead>
                            <TableHead colSpan={2} className="text-center">Latest Meeting ID</TableHead>
                            <TableHead colSpan={2} className="text-center">Total Meetings</TableHead>
                            <TableHead rowSpan={2} className="align-bottom text-center">Total Subjects (ES)</TableHead>
                        </TableRow>
                        <TableRow>
                            <TableHead className="text-center">Postgres</TableHead>
                            <TableHead className="text-center">Elasticsearch</TableHead>
                            <TableHead className="text-center">Postgres</TableHead>
                            <TableHead className="text-center">Elasticsearch</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredCities?.map((city) => {
                            const isLatestMeetingInSync = city.latestMeetingIdPostgres === city.latestMeetingIdElastic;
                            const areTotalMeetingsInSync = city.totalMeetingsPostgres === city.totalMeetingsElastic;

                            return (
                                <TableRow key={city.cityId} className={!city.isInElastic ? 'bg-red-50' : !city.isListed ? 'bg-yellow-50' : ''}>
                                    <TableCell>
                                        {city.cityName}
                                        {!city.isInElastic && <p className="text-xs text-red-600">Not in ES</p>}
                                    </TableCell>
                                    <TableCell className="text-center">{city.latestMeetingIdPostgres || 'N/A'}</TableCell>
                                    <TableCell className="text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            {city.latestMeetingIdElastic || 'N/A'}
                                            {city.isInElastic && <StatusIndicator inSync={isLatestMeetingInSync} />}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">{city.totalMeetingsPostgres}</TableCell>
                                    <TableCell className="text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            {city.totalMeetingsElastic}
                                            {city.isInElastic && <StatusIndicator inSync={areTotalMeetingsInSync} />}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">{city.totalSubjectsElastic}</TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
} 
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Bell, Filter, Loader2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { NotificationMeetingRow } from '@/components/admin/notifications/NotificationMeetingRow';
import { NotificationBulkActions } from '@/components/admin/notifications/NotificationBulkActions';
import { releaseNotificationsForMeeting, createMeetingKey } from '@/components/admin/notifications/utils';
import { MeetingNotificationStats } from '@/lib/db/notifications';
import { useToast } from '@/hooks/use-toast';

type DateRangeOption = '7days' | '30days' | '90days' | 'all';

export default function AdminNotificationsPage() {
    const [meetings, setMeetings] = useState<MeetingNotificationStats[]>([]);
    const [cities, setCities] = useState<Array<{ id: string; name: string }>>([]);
    const [loading, setLoading] = useState(true);
    const [releasingMeetings, setReleasingMeetings] = useState<Set<string>>(new Set());
    const [selectedMeetingKeys, setSelectedMeetingKeys] = useState<Set<string>>(new Set());
    const { toast } = useToast();

    // Pagination state
    const [pagination, setPagination] = useState({
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0
    });

    // Filter state
    const [filters, setFilters] = useState({
        cityId: 'all',
        status: 'all',
        dateRange: '30days' as DateRangeOption
    });

    // Calculate date range from option
    const getDateRange = (option: DateRangeOption): { startDate?: string; endDate?: string } => {
        const endDate = new Date();
        let startDate: Date | undefined;

        switch (option) {
            case '7days':
                startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30days':
                startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                break;
            case '90days':
                startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
                break;
            case 'all':
                return {};
        }

        return {
            startDate: startDate?.toISOString(),
            endDate: endDate.toISOString()
        };
    };

    // Fetch cities for filter dropdown
    const fetchCities = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/notifications?getCities=true');
            const data = await res.json();
            setCities(data.cities || []);
        } catch (error) {
            console.error('Error fetching cities:', error);
        }
    }, []);

    // Fetch notifications
    const fetchNotifications = useCallback(async (page: number = 1) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.append('page', page.toString());
            params.append('pageSize', pagination.pageSize.toString());

            if (filters.cityId && filters.cityId !== 'all') {
                params.append('cityId', filters.cityId);
            }
            if (filters.status && filters.status !== 'all') {
                params.append('status', filters.status);
            }

            const { startDate, endDate } = getDateRange(filters.dateRange);
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);

            const res = await fetch(`/api/admin/notifications?${params}`);
            const data = await res.json();

            setMeetings(data.meetings || []);
            setPagination(data.pagination || { total: 0, page: 1, pageSize: 20, totalPages: 0 });
        } catch (error) {
            console.error('Error fetching notifications:', error);
            toast({
                title: 'Error',
                description: 'Failed to fetch notifications.',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    }, [filters, pagination.pageSize, toast]);

    // Initial load
    useEffect(() => {
        fetchCities();
    }, [fetchCities]);

    useEffect(() => {
        fetchNotifications(1);
        // Clear selection when filters change
        setSelectedMeetingKeys(new Set());
    }, [filters]);

    // Handle page change
    const handlePageChange = (newPage: number) => {
        fetchNotifications(newPage);
        setSelectedMeetingKeys(new Set());
    };

    // Handle release pending for a single meeting
    const handleReleasePending = async (meetingId: string, cityId: string) => {
        const key = createMeetingKey(cityId, meetingId);
        setReleasingMeetings(prev => new Set(prev).add(key));

        try {
            const result = await releaseNotificationsForMeeting(meetingId, cityId);

            if (result.success) {
                toast({
                    title: 'Notifications released',
                    description: `Sent ${result.emailsSent} emails and ${result.messagesSent} messages.`,
                });
                fetchNotifications(pagination.page);
            } else {
                toast({
                    title: 'Error',
                    description: result.error || 'Failed to release notifications.',
                    variant: 'destructive'
                });
            }
        } catch (error) {
            console.error('Error releasing notifications:', error);
            toast({
                title: 'Error',
                description: 'Failed to release notifications.',
                variant: 'destructive'
            });
        } finally {
            setReleasingMeetings(prev => {
                const newSet = new Set(prev);
                newSet.delete(key);
                return newSet;
            });
        }
    };

    // Handle selection
    const handleSelectMeeting = (meetingId: string, cityId: string, checked: boolean) => {
        const key = createMeetingKey(cityId, meetingId);
        setSelectedMeetingKeys(prev => {
            const newSet = new Set(prev);
            if (checked) {
                newSet.add(key);
            } else {
                newSet.delete(key);
            }
            return newSet;
        });
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            const allKeys = meetings.map(m => createMeetingKey(m.cityId, m.meetingId));
            setSelectedMeetingKeys(new Set(allKeys));
        } else {
            setSelectedMeetingKeys(new Set());
        }
    };

    const isAllSelected = meetings.length > 0 && selectedMeetingKeys.size === meetings.length;
    const isPartiallySelected = selectedMeetingKeys.size > 0 && selectedMeetingKeys.size < meetings.length;

    // Handle action complete (refresh data)
    const handleActionComplete = () => {
        fetchNotifications(pagination.page);
        setSelectedMeetingKeys(new Set());
    };

    return (
        <div className="flex-1 space-y-6 p-8 pt-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Notifications</h2>
                    <p className="text-muted-foreground">
                        Manage notification delivery for all cities
                    </p>
                </div>
                <Button
                    onClick={() => fetchNotifications(pagination.page)}
                    variant="outline"
                    disabled={loading}
                >
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Filter className="h-4 w-4" />
                        Filters
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="text-sm font-medium mb-2 block">City</label>
                            <Select
                                value={filters.cityId}
                                onValueChange={(value) => setFilters({ ...filters, cityId: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="All cities" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All cities</SelectItem>
                                    {cities.map((city) => (
                                        <SelectItem key={city.id} value={city.id}>
                                            {city.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-2 block">Status</label>
                            <Select
                                value={filters.status}
                                onValueChange={(value) => setFilters({ ...filters, status: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="All statuses" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All statuses</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="sent">Sent</SelectItem>
                                    <SelectItem value="failed">Failed</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-2 block">Date Range</label>
                            <Select
                                value={filters.dateRange}
                                onValueChange={(value) => setFilters({ ...filters, dateRange: value as DateRangeOption })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select range" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="7days">Last 7 days</SelectItem>
                                    <SelectItem value="30days">Last 30 days</SelectItem>
                                    <SelectItem value="90days">Last 90 days</SelectItem>
                                    <SelectItem value="all">All time</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Bulk Actions */}
            <div className="flex items-center justify-between">
                <NotificationBulkActions
                    selectedMeetingKeys={selectedMeetingKeys}
                    meetings={meetings}
                    onSelectAll={handleSelectAll}
                    isAllSelected={isAllSelected}
                    isPartiallySelected={isPartiallySelected}
                    onActionComplete={handleActionComplete}
                />

                {/* Pagination Info */}
                {!loading && pagination.total > 0 && (
                    <div className="text-sm text-muted-foreground">
                        Showing {meetings.length} of {pagination.total} meetings
                    </div>
                )}
            </div>

            {/* Notifications Table */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
            ) : meetings.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <Bell className="h-12 w-12 text-gray-400 mb-4" />
                        <p className="text-lg font-medium text-gray-900">No notifications found</p>
                        <p className="text-sm text-gray-500">Try adjusting your filters</p>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-12"></TableHead>
                                    <TableHead className="w-12"></TableHead>
                                    <TableHead>Meeting</TableHead>
                                    <TableHead className="w-32">Before</TableHead>
                                    <TableHead className="w-32">After</TableHead>
                                    <TableHead className="w-20 text-center">Total</TableHead>
                                    <TableHead className="w-32">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {meetings.map((meeting) => {
                                    const key = createMeetingKey(meeting.cityId, meeting.meetingId);
                                    return (
                                        <NotificationMeetingRow
                                            key={key}
                                            meeting={meeting}
                                            isSelected={selectedMeetingKeys.has(key)}
                                            onSelect={(checked) => handleSelectMeeting(meeting.meetingId, meeting.cityId, checked)}
                                            onReleasePending={handleReleasePending}
                                            isReleasing={releasingMeetings.has(key)}
                                        />
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* Pagination Controls */}
            {!loading && pagination.totalPages > 1 && (
                <div className="flex items-center justify-center gap-4">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(pagination.page - 1)}
                        disabled={pagination.page <= 1}
                    >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                        Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(pagination.page + 1)}
                        disabled={pagination.page >= pagination.totalPages}
                    >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                </div>
            )}
        </div>
    );
}

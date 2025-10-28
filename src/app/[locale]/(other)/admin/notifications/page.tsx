'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bell, Send, Filter, Loader2, ExternalLink, RefreshCw, ChevronDown, ChevronUp, Mail, MessageSquare, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { el } from 'date-fns/locale';
import Link from 'next/link';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export default function AdminNotificationsPage() {
    const [notifications, setNotifications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [releasing, setReleasing] = useState<string[]>([]);
    const [resendingDeliveries, setResendingDeliveries] = useState<Set<string>>(new Set());
    const [expandedNotifications, setExpandedNotifications] = useState<Set<string>>(new Set());
    const [filters, setFilters] = useState({
        cityId: 'all',
        status: 'all',
        type: 'all'
    });

    // Fetch notifications
    useEffect(() => {
        fetchNotifications();
    }, [filters]);

    const fetchNotifications = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters.cityId && filters.cityId !== 'all') params.append('cityId', filters.cityId);
            if (filters.status && filters.status !== 'all') params.append('status', filters.status);
            if (filters.type && filters.type !== 'all') params.append('type', filters.type);

            const res = await fetch(`/api/admin/notifications?${params}`);
            const data = await res.json();
            setNotifications(data.notifications || []);
        } catch (error) {
            console.error('Error fetching notifications:', error);
        } finally {
            setLoading(false);
        }
    };

    const releaseNotifications = async (notificationIds: string[]) => {
        setReleasing(notificationIds);
        try {
            const res = await fetch('/api/admin/notifications/release', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notificationIds })
            });

            const result = await res.json();

            if (result.success) {
                alert(`Successfully sent: ${result.emailsSent} emails, ${result.messagesSent} messages`);
                fetchNotifications();
            } else {
                alert('Failed to release notifications');
            }
        } catch (error) {
            console.error('Error releasing notifications:', error);
            alert('Error releasing notifications');
        } finally {
            setReleasing([]);
        }
    };

    const toggleNotification = (notificationId: string) => {
        setExpandedNotifications(prev => {
            const newSet = new Set(prev);
            if (newSet.has(notificationId)) {
                newSet.delete(notificationId);
            } else {
                newSet.add(notificationId);
            }
            return newSet;
        });
    };

    const getDeliveryIcon = (medium: string) => {
        return medium === 'email' ? Mail : MessageSquare;
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'sent':
                return CheckCircle2;
            case 'failed':
                return XCircle;
            default:
                return Clock;
        }
    };

    // Group notifications by meeting
    const groupedNotifications = notifications.reduce((acc, notification) => {
        const key = `${notification.meeting.id}`;
        if (!acc[key]) {
            acc[key] = {
                meeting: notification.meeting,
                city: notification.city,
                notifications: []
            };
        }
        acc[key].notifications.push(notification);
        return acc;
    }, {} as Record<string, any>);

    const getPendingCount = (notifications: any[]) => {
        return notifications.filter(n => n.deliveries.some((d: any) => d.status === 'pending')).length;
    };

    const getPendingNotificationIds = (notifications: any[]) => {
        return notifications
            .filter(n => n.deliveries.some((d: any) => d.status === 'pending'))
            .map(n => n.id);
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
                            <label className="text-sm font-medium mb-2 block">Status</label>
                            <Select value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })}>
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
                            <label className="text-sm font-medium mb-2 block">Type</label>
                            <Select value={filters.type} onValueChange={(value) => setFilters({ ...filters, type: value })}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All types" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All types</SelectItem>
                                    <SelectItem value="beforeMeeting">Before Meeting</SelectItem>
                                    <SelectItem value="afterMeeting">After Meeting</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-end">
                            <Button onClick={fetchNotifications} variant="outline" className="w-full">
                                Apply Filters
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Notifications List */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
            ) : Object.keys(groupedNotifications).length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <Bell className="h-12 w-12 text-gray-400 mb-4" />
                        <p className="text-lg font-medium text-gray-900">No notifications found</p>
                        <p className="text-sm text-gray-500">Try adjusting your filters</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {Object.values(groupedNotifications).map((group: any) => {
                        const pendingCount = getPendingCount(group.notifications);
                        const pendingIds = getPendingNotificationIds(group.notifications);

                        return (
                            <Card key={group.meeting.id}>
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <CardTitle>{group.meeting.name}</CardTitle>
                                            <CardDescription>
                                                {group.city.name_municipality} • {group.meeting.administrativeBody?.name || 'No administrative body'} •
                                                {' '}{format(new Date(group.meeting.dateTime), 'PPP', { locale: el })}
                                            </CardDescription>
                                        </div>
                                        {pendingCount > 0 && (
                                            <Button
                                                onClick={() => releaseNotifications(pendingIds)}
                                                disabled={releasing.length > 0}
                                                size="sm"
                                            >
                                                {releasing.some(id => pendingIds.includes(id)) ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        Releasing...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Send className="mr-2 h-4 w-4" />
                                                        Release {pendingCount} Pending
                                                    </>
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {group.notifications.map((notification: any) => {
                                            const isExpanded = expandedNotifications.has(notification.id);
                                            const deliveryStatus = notification.deliveries[0]?.status || 'unknown';
                                            const statusColors = {
                                                pending: 'bg-yellow-100 text-yellow-800',
                                                sent: 'bg-green-100 text-green-800',
                                                failed: 'bg-red-100 text-red-800'
                                            };

                                            return (
                                                <Collapsible
                                                    key={notification.id}
                                                    open={isExpanded}
                                                    onOpenChange={() => toggleNotification(notification.id)}
                                                >
                                                    <div className="border rounded-lg bg-gray-50">
                                                        <CollapsibleTrigger asChild>
                                                            <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 transition-colors">
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <span className="font-medium">{notification.user.name || notification.user.email}</span>
                                                                        <Badge variant="outline">
                                                                            {notification.type === 'beforeMeeting' ? 'Before' : 'After'}
                                                                        </Badge>
                                                                        <Badge className={statusColors[deliveryStatus as keyof typeof statusColors]}>
                                                                            {deliveryStatus}
                                                                        </Badge>
                                                                    </div>
                                                                    <div className="text-sm text-gray-600">
                                                                        {notification.subjects.length} subjects •
                                                                        {' '}{notification.deliveries.length} deliveries
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <Link
                                                                        href={`/el/notifications/${notification.id}`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="gap-1"
                                                                        >
                                                                            <ExternalLink className="h-3 w-3" />
                                                                            View
                                                                        </Button>
                                                                    </Link>
                                                                    {isExpanded ? (
                                                                        <ChevronUp className="h-4 w-4 text-gray-500" />
                                                                    ) : (
                                                                        <ChevronDown className="h-4 w-4 text-gray-500" />
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </CollapsibleTrigger>

                                                        <CollapsibleContent>
                                                            <div className="border-t p-4 space-y-3 bg-white">
                                                                <h5 className="text-sm font-semibold text-gray-700">Deliveries</h5>
                                                                {notification.deliveries.map((delivery: any) => {
                                                                    const DeliveryIcon = getDeliveryIcon(delivery.medium);
                                                                    const StatusIcon = getStatusIcon(delivery.status);
                                                                    const isResending = resendingDeliveries.has(delivery.id);

                                                                    return (
                                                                        <div key={delivery.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded border">
                                                                            <DeliveryIcon className="h-5 w-5 text-gray-600 mt-0.5" />
                                                                            <div className="flex-1 space-y-1">
                                                                                <div className="flex items-center gap-2">
                                                                                    <span className="text-sm font-medium capitalize">
                                                                                        {delivery.medium}
                                                                                        {delivery.messageSentVia && ` (${delivery.messageSentVia})`}
                                                                                    </span>
                                                                                    <Badge
                                                                                        variant="outline"
                                                                                        className={statusColors[delivery.status as keyof typeof statusColors]}
                                                                                    >
                                                                                        <StatusIcon className="h-3 w-3 mr-1" />
                                                                                        {delivery.status}
                                                                                    </Badge>
                                                                                </div>
                                                                                <div className="text-xs text-gray-600">
                                                                                    {delivery.email && <div>To: {delivery.email}</div>}
                                                                                    {delivery.phone && <div>To: {delivery.phone}</div>}
                                                                                </div>
                                                                                <div className="text-xs text-gray-500 flex items-center gap-1">
                                                                                    <Clock className="h-3 w-3" />
                                                                                    Created: {format(new Date(delivery.createdAt), 'PPp', { locale: el })}
                                                                                </div>
                                                                                {delivery.sentAt && (
                                                                                    <div className="text-xs text-gray-500 flex items-center gap-1">
                                                                                        <CheckCircle2 className="h-3 w-3" />
                                                                                        Sent: {format(new Date(delivery.sentAt), 'PPp', { locale: el })}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </CollapsibleContent>
                                                    </div>
                                                </Collapsible>
                                            );
                                        })}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}


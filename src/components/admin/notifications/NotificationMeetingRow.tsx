"use client";

import { useState } from "react";
import { format } from "date-fns";
import { el } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import { ExpandableTableRow } from "@/components/ui/expandable-table-row";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Calendar,
    Building,
    MapPin,
    Mail,
    MessageSquare,
    Clock,
    CheckCircle2,
    XCircle,
    Send,
    Loader2,
    ExternalLink,
    Trash2
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { MeetingNotificationStats, NotificationStatusCounts } from "@/lib/db/notifications";
import { createMeetingKey } from "./utils";

interface NotificationMeetingRowProps {
    meeting: MeetingNotificationStats;
    isSelected: boolean;
    onSelect: (checked: boolean) => void;
    onReleasePending: (meetingId: string, cityId: string) => Promise<void>;
    isReleasing: boolean;
    onDataChange?: () => void;
}

// Type for notification data returned from API
interface NotificationData {
    id: string;
    type: 'beforeMeeting' | 'afterMeeting';
    user: {
        id: string;
        email: string;
        name: string | null;
    };
    deliveries: Array<{
        id: string;
        medium: 'email' | 'message';
        status: 'pending' | 'sent' | 'failed';
        email: string | null;
        phone: string | null;
        messageSentVia: 'whatsapp' | 'sms' | null;
        sentAt: string | null;
        createdAt: string;
    }>;
    subjects: Array<{
        reason: string;
        subject: {
            id: string;
            name: string;
        };
    }>;
}

function StatusCounts({ counts, label }: { counts: NotificationStatusCounts | null; label: string }) {
    if (!counts) {
        return <span className="text-muted-foreground text-sm">--</span>;
    }

    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{label}</span>
            <div className="flex items-center gap-2 text-sm">
                {counts.sent > 0 && (
                    <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="h-3 w-3" />
                        {counts.sent}
                    </span>
                )}
                {counts.pending > 0 && (
                    <span className="flex items-center gap-1 text-yellow-600">
                        <Clock className="h-3 w-3" />
                        {counts.pending}
                    </span>
                )}
                {counts.failed > 0 && (
                    <span className="flex items-center gap-1 text-red-600">
                        <XCircle className="h-3 w-3" />
                        {counts.failed}
                    </span>
                )}
                {counts.total === 0 && (
                    <span className="text-muted-foreground">0</span>
                )}
            </div>
        </div>
    );
}

function DeliveryRow({ delivery }: { delivery: NotificationData['deliveries'][0] }) {
    const Icon = delivery.medium === 'email' ? Mail : MessageSquare;
    const statusColors = {
        pending: 'bg-yellow-100 text-yellow-800',
        sent: 'bg-green-100 text-green-800',
        failed: 'bg-red-100 text-red-800'
    };

    return (
        <div className="flex items-center gap-3 py-1.5 px-2 bg-muted/50 rounded text-sm">
            <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="flex-1 truncate">
                {delivery.email || delivery.phone}
            </span>
            {delivery.messageSentVia && (
                <Badge variant="outline" className="text-xs">
                    {delivery.messageSentVia}
                </Badge>
            )}
            <Badge className={`${statusColors[delivery.status]} text-xs`}>
                {delivery.status}
            </Badge>
            {delivery.sentAt && (
                <span className="text-xs text-muted-foreground">
                    {format(new Date(delivery.sentAt), 'HH:mm', { locale: el })}
                </span>
            )}
        </div>
    );
}

function NotificationCard({ notification }: { notification: NotificationData }) {
    const userName = notification.user.name || notification.user.email;

    return (
        <div className="border rounded-lg p-3 bg-background">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{userName}</span>
                    <Badge variant="outline" className="text-xs">
                        {notification.type === 'beforeMeeting' ? 'Before' : 'After'}
                    </Badge>
                </div>
                <Link
                    href={`/el/notifications/${notification.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                    <ExternalLink className="h-3 w-3" />
                    View
                </Link>
            </div>
            <div className="text-xs text-muted-foreground mb-2">
                {notification.subjects.length} subject{notification.subjects.length !== 1 ? 's' : ''}
            </div>
            <div className="space-y-1">
                {notification.deliveries.map((delivery) => (
                    <DeliveryRow key={delivery.id} delivery={delivery} />
                ))}
            </div>
        </div>
    );
}

export function NotificationMeetingRow({
    meeting,
    isSelected,
    onSelect,
    onReleasePending,
    isReleasing,
    onDataChange
}: NotificationMeetingRowProps) {
    const [notifications, setNotifications] = useState<NotificationData[]>([]);
    const [loadingNotifications, setLoadingNotifications] = useState(false);
    const [hasLoadedNotifications, setHasLoadedNotifications] = useState(false);
    const [deletingType, setDeletingType] = useState<'beforeMeeting' | 'afterMeeting' | null>(null);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [typeToDelete, setTypeToDelete] = useState<'beforeMeeting' | 'afterMeeting' | null>(null);
    const { toast } = useToast();

    const meetingDate = format(new Date(meeting.meetingDate), "MMM dd, yyyy", { locale: el });

    const totalPending = (meeting.before?.pending || 0) + (meeting.after?.pending || 0);
    const totalNotifications = (meeting.before?.total || 0) + (meeting.after?.total || 0);

    // Load notifications when row is expanded
    const loadNotifications = async () => {
        if (hasLoadedNotifications) return;

        setLoadingNotifications(true);
        try {
            const res = await fetch(
                `/api/admin/notifications?meetingId=${meeting.meetingId}&cityIdForMeeting=${meeting.cityId}`
            );
            const data = await res.json();
            setNotifications(data.notifications || []);
            setHasLoadedNotifications(true);
        } catch (error) {
            console.error('Error loading notifications:', error);
        } finally {
            setLoadingNotifications(false);
        }
    };

    const handleReleasePending = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await onReleasePending(meeting.meetingId, meeting.cityId);
    };

    const handleDeleteType = async (type: 'beforeMeeting' | 'afterMeeting') => {
        setDeletingType(type);
        try {
            const res = await fetch('/api/admin/notifications', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    meetingKeys: [{ meetingId: meeting.meetingId, cityId: meeting.cityId }],
                    type
                })
            });

            if (res.ok) {
                const result = await res.json();
                toast({
                    title: "Notifications deleted",
                    description: `Deleted ${result.deletedCount} ${type === 'beforeMeeting' ? 'before' : 'after'} meeting notifications.`,
                });
                // Refresh the notifications list
                setHasLoadedNotifications(false);
                loadNotifications();
                // Notify parent to refresh data
                onDataChange?.();
            } else {
                toast({
                    title: "Error",
                    description: "Failed to delete notifications.",
                    variant: "destructive"
                });
            }
        } catch (error) {
            console.error('Error deleting notifications:', error);
            toast({
                title: "Error",
                description: "Failed to delete notifications.",
                variant: "destructive"
            });
        } finally {
            setDeletingType(null);
            setShowDeleteDialog(false);
            setTypeToDelete(null);
        }
    };

    const openDeleteDialog = (type: 'beforeMeeting' | 'afterMeeting') => {
        setTypeToDelete(type);
        setShowDeleteDialog(true);
    };

    // Group notifications by type for display
    const beforeNotifications = notifications.filter(n => n.type === 'beforeMeeting');
    const afterNotifications = notifications.filter(n => n.type === 'afterMeeting');

    const expandedContent = (
        <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
            {loadingNotifications ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <>
                    {/* Before Meeting Notifications */}
                    {beforeNotifications.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-medium flex items-center gap-2">
                                    Before Meeting
                                    <Badge variant="outline">{beforeNotifications.length}</Badge>
                                </h4>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => openDeleteDialog('beforeMeeting')}
                                    disabled={deletingType !== null}
                                >
                                    {deletingType === 'beforeMeeting' ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <>
                                            <Trash2 className="h-4 w-4 mr-1" />
                                            Delete
                                        </>
                                    )}
                                </Button>
                            </div>
                            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                                {beforeNotifications.map((notification) => (
                                    <NotificationCard key={notification.id} notification={notification} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* After Meeting Notifications */}
                    {afterNotifications.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-medium flex items-center gap-2">
                                    After Meeting
                                    <Badge variant="outline">{afterNotifications.length}</Badge>
                                </h4>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => openDeleteDialog('afterMeeting')}
                                    disabled={deletingType !== null}
                                >
                                    {deletingType === 'afterMeeting' ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <>
                                            <Trash2 className="h-4 w-4 mr-1" />
                                            Delete
                                        </>
                                    )}
                                </Button>
                            </div>
                            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                                {afterNotifications.map((notification) => (
                                    <NotificationCard key={notification.id} notification={notification} />
                                ))}
                            </div>
                        </div>
                    )}

                    {notifications.length === 0 && !loadingNotifications && (
                        <div className="text-center py-4 text-muted-foreground">
                            No notifications found
                        </div>
                    )}
                </>
            )}
        </div>
    );

    return (
        <>
        <ExpandableTableRow
            rowId={createMeetingKey(meeting.cityId, meeting.meetingId)}
            isSelected={isSelected}
            onSelect={(checked) => {
                onSelect(checked);
                if (checked && !hasLoadedNotifications) {
                    loadNotifications();
                }
            }}
            expandedContent={expandedContent}
            ariaLabel={meeting.meetingName}
        >
            {/* Meeting Info */}
            <TableCell className="min-w-0" onClick={() => loadNotifications()}>
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-foreground truncate">
                            {meeting.meetingName}
                        </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground min-w-0">
                        <div className="flex items-center gap-1 flex-shrink-0">
                            <Calendar className="h-3 w-3" />
                            {meetingDate}
                        </div>
                        {meeting.administrativeBodyName && (
                            <div className="flex items-center gap-1 min-w-0">
                                <Building className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">{meeting.administrativeBodyName}</span>
                            </div>
                        )}
                        <div className="flex items-center gap-1 min-w-0">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{meeting.cityName}</span>
                        </div>
                    </div>
                </div>
            </TableCell>

            {/* Before Meeting Stats */}
            <TableCell className="w-32">
                <StatusCounts counts={meeting.before} label="Before" />
            </TableCell>

            {/* After Meeting Stats */}
            <TableCell className="w-32">
                <StatusCounts counts={meeting.after} label="After" />
            </TableCell>

            {/* Total */}
            <TableCell className="w-20 text-center">
                <Badge variant="outline">{totalNotifications}</Badge>
            </TableCell>

            {/* Actions */}
            <TableCell className="w-32" onClick={(e) => e.stopPropagation()}>
                {totalPending > 0 && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleReleasePending}
                        disabled={isReleasing}
                        className="w-full"
                    >
                        {isReleasing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                            <>
                                <Send className="h-3 w-3 mr-1" />
                                Release {totalPending}
                            </>
                        )}
                    </Button>
                )}
            </TableCell>
        </ExpandableTableRow>

        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogContent onClick={(e) => e.stopPropagation()}>
                <DialogHeader>
                    <DialogTitle>Delete {typeToDelete === 'beforeMeeting' ? 'Before' : 'After'} Meeting Notifications</DialogTitle>
                    <DialogDescription>
                        Are you sure you want to delete all {typeToDelete === 'beforeMeeting' ? 'before' : 'after'} meeting
                        notifications for &quot;{meeting.meetingName}&quot;? This action cannot be undone.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => typeToDelete && handleDeleteType(typeToDelete)}
                        disabled={deletingType !== null}
                    >
                        {deletingType ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Delete
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        </>
    );
}

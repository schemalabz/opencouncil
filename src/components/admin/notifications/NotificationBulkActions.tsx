"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Send, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MeetingNotificationStats } from "@/lib/db/notifications";
import { releaseNotificationsForMeeting, parseMeetingKey, createMeetingKey } from "./utils";

interface NotificationBulkActionsProps {
    selectedMeetingKeys: Set<string>; // Format: "cityId-meetingId"
    meetings: MeetingNotificationStats[];
    onSelectAll: (checked: boolean) => void;
    isAllSelected: boolean;
    isPartiallySelected: boolean;
    onActionComplete: () => void;
}

export function NotificationBulkActions({
    selectedMeetingKeys,
    meetings,
    onSelectAll,
    isAllSelected,
    isPartiallySelected,
    onActionComplete
}: NotificationBulkActionsProps) {
    const [isReleasing, setIsReleasing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const { toast } = useToast();

    const hasSelectedMeetings = selectedMeetingKeys.size > 0;

    // Get selected meetings data
    const selectedMeetings = meetings.filter(m =>
        selectedMeetingKeys.has(createMeetingKey(m.cityId, m.meetingId))
    );

    // Calculate totals for selected meetings
    const totalPending = selectedMeetings.reduce((sum, m) =>
        sum + (m.before?.pending || 0) + (m.after?.pending || 0), 0
    );
    const totalNotifications = selectedMeetings.reduce((sum, m) =>
        sum + (m.before?.total || 0) + (m.after?.total || 0), 0
    );

    const handleReleaseSelected = async () => {
        if (totalPending === 0) return;

        setIsReleasing(true);
        let successCount = 0;
        let errorCount = 0;

        try {
            for (const meeting of selectedMeetings) {
                if ((meeting.before?.pending || 0) + (meeting.after?.pending || 0) === 0) {
                    continue;
                }

                const result = await releaseNotificationsForMeeting(meeting.meetingId, meeting.cityId);

                if (result.success) {
                    successCount += (result.emailsSent || 0) + (result.messagesSent || 0);
                } else {
                    errorCount++;
                }
            }

            if (errorCount === 0) {
                toast({
                    title: "Notifications released",
                    description: `Successfully sent ${successCount} deliveries.`,
                });
            } else {
                toast({
                    title: "Some releases failed",
                    description: `Sent ${successCount} deliveries, ${errorCount} meetings had errors.`,
                    variant: "destructive"
                });
            }

            onActionComplete();
        } catch (error) {
            console.error('Error releasing notifications:', error);
            toast({
                title: "Error",
                description: "Failed to release notifications.",
                variant: "destructive"
            });
        } finally {
            setIsReleasing(false);
        }
    };

    const handleDeleteSelected = async () => {
        setIsDeleting(true);

        try {
            const meetingKeys = Array.from(selectedMeetingKeys).map(parseMeetingKey);

            const res = await fetch('/api/admin/notifications', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ meetingKeys })
            });

            if (res.ok) {
                const result = await res.json();
                toast({
                    title: "Notifications deleted",
                    description: `Deleted ${result.deletedCount} notifications.`,
                });
                onActionComplete();
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
            setIsDeleting(false);
            setShowDeleteDialog(false);
        }
    };

    const handleSelectAll = (checked: boolean) => {
        onSelectAll(checked);
    };

    return (
        <>
            <div className="flex items-center gap-4">
                {/* Select All Checkbox */}
                <div className="flex items-center gap-2">
                    <div className="relative flex items-center">
                        <Checkbox
                            checked={isAllSelected}
                            onCheckedChange={handleSelectAll}
                            aria-label="Select all meetings"
                        />
                        {/* Visual indicator for indeterminate state */}
                        {isPartiallySelected && !isAllSelected && (
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                                <div className="w-1.5 h-1.5 rounded-full bg-current" />
                            </div>
                        )}
                    </div>
                    <span className="text-sm text-muted-foreground">
                        {selectedMeetingKeys.size > 0
                            ? `${selectedMeetingKeys.size} selected`
                            : 'Select all'
                        }
                    </span>
                </div>

                {/* Bulk Action Buttons */}
                {hasSelectedMeetings && (
                    <div className="flex gap-2">
                        {/* Release Pending */}
                        {totalPending > 0 && (
                            <Button
                                variant="default"
                                size="sm"
                                disabled={isReleasing || isDeleting}
                                onClick={handleReleaseSelected}
                            >
                                {isReleasing ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Releasing...
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-4 h-4 mr-2" />
                                        Release {totalPending} Pending
                                    </>
                                )}
                            </Button>
                        )}

                        {/* Delete Selected */}
                        <Button
                            variant="destructive"
                            size="sm"
                            disabled={isReleasing || isDeleting}
                            onClick={() => setShowDeleteDialog(true)}
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Deleting...
                                </>
                            ) : (
                                <>
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete {totalNotifications}
                                </>
                            )}
                        </Button>
                    </div>
                )}
            </div>

            {/* Delete Confirmation Dialog */}
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Notifications</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete {totalNotifications} notifications
                            from {selectedMeetingKeys.size} meeting{selectedMeetingKeys.size !== 1 ? 's' : ''}?
                            This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteSelected}
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

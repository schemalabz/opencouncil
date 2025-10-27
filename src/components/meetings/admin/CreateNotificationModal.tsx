'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface Subject {
    id: string;
    name: string;
    description: string;
    topic: {
        id: string;
        name: string;
        colorHex: string;
    } | null;
    location: {
        id: string;
        text: string;
    } | null;
}

interface SubjectImportance {
    topicImportance: 'doNotNotify' | 'normal' | 'high';
    proximityImportance: 'none' | 'near' | 'wide';
}

interface CreateNotificationModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    subjects: Subject[];
    notificationType: 'beforeMeeting' | 'afterMeeting';
    onCreateNotifications: (
        type: 'beforeMeeting' | 'afterMeeting',
        subjectImportances: Record<string, SubjectImportance>,
        sendImmediately: boolean
    ) => Promise<void>;
}

export function CreateNotificationModal({
    open,
    onOpenChange,
    subjects,
    notificationType,
    onCreateNotifications
}: CreateNotificationModalProps) {
    const [sendImmediately, setSendImmediately] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [subjectImportances, setSubjectImportances] = useState<Record<string, SubjectImportance>>(() => {
        // Initialize all subjects with default values
        const initial: Record<string, SubjectImportance> = {};
        subjects.forEach(subject => {
            initial[subject.id] = {
                topicImportance: 'doNotNotify',
                proximityImportance: 'none'
            };
        });
        return initial;
    });

    const updateSubjectImportance = (
        subjectId: string,
        field: 'topicImportance' | 'proximityImportance',
        value: string
    ) => {
        setSubjectImportances(prev => ({
            ...prev,
            [subjectId]: {
                ...prev[subjectId],
                [field]: value
            }
        }));
    };

    const handleCreate = async () => {
        setIsCreating(true);
        try {
            await onCreateNotifications(notificationType, subjectImportances, sendImmediately);
        } finally {
            setIsCreating(false);
        }
    };

    // Count how many subjects will be included (not doNotNotify or have proximity)
    const activeSubjects = subjects.filter(subject => {
        const importance = subjectImportances[subject.id];
        return importance.topicImportance !== 'doNotNotify' || importance.proximityImportance !== 'none';
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        Create {notificationType === 'beforeMeeting' ? 'Before Meeting' : 'After Meeting'} Notifications
                    </DialogTitle>
                    <DialogDescription>
                        Configure which subjects to include and their importance levels. Users will be notified based on their topic interests and location preferences.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Send Immediately Switch */}
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div className="space-y-0.5">
                            <Label htmlFor="send-immediately" className="text-base font-medium">
                                Delivery Mode
                            </Label>
                            <p className="text-sm text-gray-600">
                                {sendImmediately
                                    ? 'Notifications will be sent immediately to all matched users'
                                    : 'Notifications will be created as pending and require approval'}
                            </p>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Label htmlFor="send-immediately" className="text-sm">
                                {sendImmediately ? 'Send Now' : 'Pending'}
                            </Label>
                            <Switch
                                id="send-immediately"
                                checked={sendImmediately}
                                onCheckedChange={setSendImmediately}
                            />
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="p-4 bg-blue-50 rounded-lg">
                        <p className="text-sm font-medium text-blue-900">
                            {activeSubjects.length} of {subjects.length} subjects will be included in notifications
                        </p>
                    </div>

                    {/* Subjects List */}
                    <div className="space-y-4">
                        <h4 className="font-medium text-sm text-gray-700">
                            Configure Subject Importance
                        </h4>

                        {subjects.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">
                                No subjects found for this meeting
                            </div>
                        ) : (
                            subjects.map(subject => (
                                <div
                                    key={subject.id}
                                    className="border rounded-lg p-4 space-y-3 hover:bg-gray-50 transition-colors"
                                >
                                    {/* Subject Header */}
                                    <div className="space-y-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <h5 className="font-medium text-gray-900 flex-1">
                                                {subject.name}
                                            </h5>
                                            {subject.topic && (
                                                <Badge
                                                    style={{
                                                        backgroundColor: subject.topic.colorHex,
                                                        color: 'white'
                                                    }}
                                                    className="shrink-0"
                                                >
                                                    {subject.topic.name}
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-600 line-clamp-2">
                                            {subject.description}
                                        </p>
                                    </div>

                                    {/* Importance Selectors */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs text-gray-600">
                                                Topic Importance
                                            </Label>
                                            <Select
                                                value={subjectImportances[subject.id]?.topicImportance || 'doNotNotify'}
                                                onValueChange={(value) =>
                                                    updateSubjectImportance(subject.id, 'topicImportance', value)
                                                }
                                            >
                                                <SelectTrigger className="h-9">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="doNotNotify">Do Not Notify</SelectItem>
                                                    <SelectItem value="normal">Normal</SelectItem>
                                                    <SelectItem value="high">High (All Users)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs text-gray-600">
                                                Proximity Importance
                                            </Label>
                                            <Select
                                                value={subjectImportances[subject.id]?.proximityImportance || 'none'}
                                                onValueChange={(value) =>
                                                    updateSubjectImportance(subject.id, 'proximityImportance', value)
                                                }
                                            >
                                                <SelectTrigger className="h-9">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">None</SelectItem>
                                                    <SelectItem value="near">Near (250m)</SelectItem>
                                                    <SelectItem value="wide">Wide (1000m)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isCreating}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreate}
                        disabled={isCreating || subjects.length === 0}
                    >
                        {isCreating ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            <>
                                {sendImmediately ? 'Create & Send' : 'Create Pending'}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


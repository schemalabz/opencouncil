'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, Ban, Star, AlertCircle, Download } from 'lucide-react';
import { useCouncilMeetingData } from '../CouncilMeetingDataContext';
import { TripleToggle } from '@/components/ui/triple-toggle';
import { stripMarkdown } from '@/lib/formatters/markdown';

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
    const { meeting, city } = useCouncilMeetingData();
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
    const [impactPreview, setImpactPreview] = useState<{ totalUsers: number; subjectImpact: Record<string, number> } | null>(null);
    const [isLoadingImpact, setIsLoadingImpact] = useState(false);

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

    // Calculate impact preview when subject importances change
    useEffect(() => {
        const calculateImpact = async () => {
            setIsLoadingImpact(true);
            try {
                const response = await fetch(`/api/cities/${city.id}/meetings/${meeting.id}/notifications/preview`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ subjectImportances })
                });

                if (response.ok) {
                    const data = await response.json();
                    setImpactPreview(data);
                }
            } catch (error) {
                console.error('Error calculating impact:', error);
            } finally {
                setIsLoadingImpact(false);
            }
        };

        // Debounce the calculation
        const timeoutId = setTimeout(calculateImpact, 500);
        return () => clearTimeout(timeoutId);
    }, [subjectImportances, city.id, meeting.id]);

    const handleCreate = async () => {
        setIsCreating(true);
        try {
            await onCreateNotifications(notificationType, subjectImportances, sendImmediately);
        } finally {
            setIsCreating(false);
        }
    };

    const handleExportCSV = () => {
        const getTopicImportanceLabel = (value: string) => {
            switch (value) {
                case 'doNotNotify':
                    return 'Do Not Notify';
                case 'normal':
                    return 'Normal';
                case 'high':
                    return 'High';
                default:
                    return value;
            }
        };

        const getProximityImportanceLabel = (value: string, hasLocation: boolean) => {
            if (!hasLocation) {
                return 'χωρίς τοποθεσία';
            }
            switch (value) {
                case 'none':
                    return 'None';
                case 'near':
                    return 'Near';
                case 'wide':
                    return 'Wide';
                default:
                    return value;
            }
        };

        const csvRows = [
            ['Subject', 'Topic', 'Topic Importance', 'Location Importance', 'Impact'].join(',')
        ];

        subjects.forEach(subject => {
            const importance = subjectImportances[subject.id];
            const topicName = subject.topic?.name || '';
            const topicImportance = getTopicImportanceLabel(importance?.topicImportance || 'doNotNotify');
            const proximityImportance = getProximityImportanceLabel(
                importance?.proximityImportance || 'none',
                subject.location !== null
            );
            const impact = impactPreview?.subjectImpact[subject.id] || 0;

            // Escape commas and quotes in CSV values
            const escapeCSV = (value: string | number) => {
                const str = String(value);
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            };

            csvRows.push([
                escapeCSV(subject.name),
                escapeCSV(topicName),
                escapeCSV(topicImportance),
                escapeCSV(proximityImportance),
                escapeCSV(impact)
            ].join(','));
        });

        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `notification-config-${notificationType}-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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

                <div className="flex justify-end">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportCSV}
                        disabled={subjects.length === 0}
                    >
                        <Download className="mr-2 h-4 w-4" />
                        Export to CSV
                    </Button>
                </div>

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

                    {/* Impact Preview */}
                    <div className="p-4 bg-blue-50 rounded-lg h-20 flex flex-col justify-center">
                        <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-blue-700" />
                            <span className="text-sm font-medium text-blue-900">
                                Notification Impact
                            </span>
                            {isLoadingImpact && (
                                <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                            )}
                        </div>
                        {impactPreview && !isLoadingImpact ? (
                            <div className="space-y-1">
                                <p className="text-lg font-semibold text-blue-900">
                                    {impactPreview.totalUsers} users will receive notifications
                                </p>
                                <p className="text-xs text-blue-700">
                                    Across {activeSubjects.length} subjects
                                </p>
                            </div>
                        ) : (
                            <p className="text-sm text-blue-700">
                                Calculating...
                            </p>
                        )}
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
                                            {stripMarkdown(subject.description)}
                                        </p>
                                    </div>

                                    {/* Importance Selectors */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-2">
                                            <Label className="text-xs text-gray-600 block">
                                                Topic Importance
                                            </Label>
                                            <TripleToggle
                                                value={subjectImportances[subject.id]?.topicImportance || 'doNotNotify'}
                                                onChange={(value) =>
                                                    updateSubjectImportance(subject.id, 'topicImportance', value)
                                                }
                                                options={[
                                                    { value: 'doNotNotify', label: 'Do Not Notify', icon: <Ban className="h-3 w-3" /> },
                                                    { value: 'normal', label: 'Normal', icon: <AlertCircle className="h-3 w-3" /> },
                                                    { value: 'high', label: 'High', icon: <Star className="h-3 w-3" /> }
                                                ]}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-xs text-gray-600 block">
                                                Proximity Importance
                                            </Label>
                                            <TripleToggle
                                                value={subjectImportances[subject.id]?.proximityImportance || 'none'}
                                                onChange={(value) =>
                                                    updateSubjectImportance(subject.id, 'proximityImportance', value)
                                                }
                                                disabled={subject.location === null}
                                                options={[
                                                    { value: 'none', label: 'None', icon: <Ban className="h-3 w-3" /> },
                                                    { value: 'near', label: 'Near', icon: <AlertCircle className="h-3 w-3" /> },
                                                    { value: 'wide', label: 'Wide', icon: <Star className="h-3 w-3" /> }
                                                ]}
                                            />
                                        </div>
                                    </div>

                                    {/* Subject-level impact */}
                                    {isLoadingImpact ? (
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                            <span>Calculating impact...</span>
                                        </div>
                                    ) : impactPreview && impactPreview.subjectImpact[subject.id] !== undefined ? (
                                        <div className="flex items-center gap-2 text-xs text-gray-600">
                                            <Users className="h-3 w-3" />
                                            <span>
                                                {impactPreview.subjectImpact[subject.id]} users will be notified about this subject
                                            </span>
                                        </div>
                                    ) : null}
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


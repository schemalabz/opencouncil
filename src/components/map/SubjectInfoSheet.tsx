'use client';

import { useRouter } from 'next/navigation';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    FileText,
    X,
    Calendar,
    Clock,
    Users,
    MapPin,
    Building2
} from 'lucide-react';
import Icon from '@/components/icon';
import { icons } from 'lucide-react';
import { motion } from 'framer-motion';

interface SubjectInfoSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    subjectName: string;
    subjectId: string;
    cityId: string;
    councilMeetingId: string;
    // Additional metadata
    description?: string;
    locationText?: string;
    topicName?: string;
    topicColor?: string;
    topicIcon?: string | null;
    meetingDate?: string;
    meetingName?: string;
    discussionTimeSeconds?: number;
    speakerCount?: number;
    cityName?: string;
}

export function SubjectInfoSheet({
    open,
    onOpenChange,
    subjectName,
    subjectId,
    cityId,
    councilMeetingId,
    description,
    locationText,
    topicName,
    topicColor,
    topicIcon,
    meetingDate,
    meetingName,
    discussionTimeSeconds,
    speakerCount,
    cityName
}: SubjectInfoSheetProps) {
    const router = useRouter();

    const handleViewSubject = () => {
        router.push(`/${cityId}/${councilMeetingId}/subjects/${subjectId}`);
    };

    // Format meeting date
    const formattedDate = meetingDate ? new Date(meetingDate).toLocaleDateString('el-GR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }) : null;

    // Format discussion time
    const formattedTime = discussionTimeSeconds ? (() => {
        const minutes = Math.floor(discussionTimeSeconds / 60);
        if (minutes < 60) return `${minutes} λεπτά`;
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return remainingMinutes > 0 ? `${hours}ω ${remainingMinutes}λ` : `${hours} ώρα${hours > 1 ? 'ες' : ''}`;
    })() : null;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
                <button
                    onClick={() => onOpenChange(false)}
                    className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none z-10"
                >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                </button>

                <SheetHeader className="text-left mb-6 pr-8">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="space-y-4"
                    >
                        {/* Topic badge and title */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                {topicName && (
                                    <div className="flex items-center gap-2">
                                        {topicIcon && (topicIcon in icons) && (
                                            <div
                                                className="p-1.5 rounded-lg shadow-sm"
                                                style={{ backgroundColor: topicColor ? topicColor + "15" : "#f3f4f6" }}
                                            >
                                                <Icon
                                                    name={topicIcon as keyof typeof icons}
                                                    color={topicColor || "#6b7280"}
                                                    size={16}
                                                />
                                            </div>
                                        )}
                                        <span
                                            className="text-xs px-2 py-1 rounded-full font-medium text-white"
                                            style={{ backgroundColor: topicColor }}
                                        >
                                            {topicName}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <SheetTitle className="text-xl leading-tight text-left">{subjectName}</SheetTitle>
                            {/* City and location on same line */}
                            {(cityName || locationText) && (
                                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1 line-clamp-1">
                                    {cityName && (
                                        <>
                                            <Building2 className="w-3 h-3" />
                                            <span>{cityName}</span>
                                        </>
                                    )}
                                    {cityName && locationText && (
                                        <span className="mx-1">•</span>
                                    )}
                                    {locationText && (
                                        <>
                                            <MapPin className="w-4 h-4" />
                                            <span>{locationText}</span>
                                        </>
                                    )}
                                </p>
                            )}
                        </div>
                    </motion.div>
                </SheetHeader>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.3 }}
                    className="space-y-6"
                >
                    {/* Meeting info cards */}
                    <div className="grid gap-3">
                        {formattedDate && (
                            <div className="p-3 bg-muted rounded-lg">
                                <div className="flex items-center gap-2 text-sm">
                                    <Calendar className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-muted-foreground">Ημερομηνία:</span>
                                    <span className="font-medium">{formattedDate}</span>
                                </div>
                            </div>
                        )}

                        {meetingName && (
                            <div className="p-3 bg-muted rounded-lg">
                                <div className="flex items-center gap-2 text-sm">
                                    <FileText className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-muted-foreground">Συνεδρίαση:</span>
                                    <span className="font-medium line-clamp-1">{meetingName}</span>
                                </div>
                            </div>
                        )}

                        {/* Stats grid */}
                        {(formattedTime || (speakerCount !== undefined && speakerCount > 0)) && (
                            <div className="grid grid-cols-2 gap-3">
                                {formattedTime && (
                                    <div className="p-3 bg-muted rounded-lg">
                                        <div className="flex items-center gap-2 text-sm">
                                            <Clock className="w-4 h-4 text-muted-foreground" />
                                            <div>
                                                <p className="text-xs text-muted-foreground">Διάρκεια συζήτησης</p>
                                                <p className="font-medium">{formattedTime}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {speakerCount !== undefined && speakerCount > 0 && (
                                    <div className="p-3 bg-muted rounded-lg">
                                        <div className="flex items-center gap-2 text-sm">
                                            <Users className="w-4 h-4 text-muted-foreground" />
                                            <div>
                                                <p className="text-xs text-muted-foreground">Ομιλητές</p>
                                                <p className="font-medium">{speakerCount}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Description */}
                    {description && (
                        <div className="space-y-2">
                            <h4 className="text-sm font-medium">Περιγραφή</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                                {description}
                            </p>
                        </div>
                    )}

                    {/* Action button */}
                    <div className="space-y-3 pt-4">
                        <Button
                            onClick={handleViewSubject}
                            size="lg"
                            className="w-full"
                        >
                            <FileText className="w-4 h-4 mr-2" />
                            Προβολή Πλήρους Θέματος
                        </Button>

                        <p className="text-xs text-center text-muted-foreground">
                            Δείτε την πλήρη συζήτηση, ψηφοφορίες και λεπτομέρειες
                        </p>
                    </div>
                </motion.div>
            </SheetContent>
        </Sheet>
    );
}


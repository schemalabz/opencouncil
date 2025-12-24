"use client";

import React, { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useCouncilMeetingData } from '../CouncilMeetingDataContext';
import { useVideo } from '../VideoProvider';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, Clock, Hash, ChevronRight, ChevronDown, Play, User } from 'lucide-react';
import { getPartyFromRoles, UNKNOWN_SPEAKER_LABEL } from "@/lib/utils";
import { formatDuration, formatTimestamp } from "@/lib/formatters/time";
import { cn } from "@/lib/utils";

interface SpeakerStat {
    id: string; // Used for key and expansion
    speakerTagIds: Set<string>;
    personId: string | null;
    label: string | null;
    name: string;
    partyColor?: string;
    segmentCount: number;
    totalDuration: number;
    segments: {
        id: string;
        startTimestamp: number;
        endTimestamp: number;
    }[];
    firstAppearance: number;
}

function SpeakerStatsContent() {
    const { transcript, getSpeakerTag, getPerson } = useCouncilMeetingData();
    const { seekTo } = useVideo();
    const t = useTranslations('editing');
    const [expandedSpeakerId, setExpandedSpeakerId] = useState<string | null>(null);

    const speakerStats = useMemo(() => {
        const stats = new Map<string, SpeakerStat>();

        transcript.forEach(segment => {
            const tagId = segment.speakerTagId;
            const tag = getSpeakerTag(tagId);
            const personId = tag?.personId || null;
            
            // Determine grouping key: personId if matched, otherwise speakerTagId
            const key = personId || tagId;

            if (!stats.has(key)) {
                const person = personId ? getPerson(personId) : null;
                const party = person ? getPartyFromRoles(person.roles) : null;
                
                let name = "Unknown";
                if (person) {
                    name = person.name;
                } else if (tag?.label) {
                    name = tag.label;
                }

                stats.set(key, {
                    id: key,
                    speakerTagIds: new Set([tagId]),
                    personId,
                    label: tag?.label || null,
                    name,
                    partyColor: party?.colorHex,
                    segmentCount: 0,
                    totalDuration: 0,
                    segments: [],
                    firstAppearance: segment.startTimestamp
                });
            }

            const stat = stats.get(key)!;
            stat.speakerTagIds.add(tagId);
            stat.segmentCount++;
            stat.totalDuration += (segment.endTimestamp - segment.startTimestamp);
            // Maintain minimal appearance time
            stat.firstAppearance = Math.min(stat.firstAppearance, segment.startTimestamp);
            stat.segments.push({
                id: segment.id,
                startTimestamp: segment.startTimestamp,
                endTimestamp: segment.endTimestamp
            });
        });

        // Sort each speaker's segments chronologically
        stats.forEach(stat => {
            stat.segments.sort((a, b) => a.startTimestamp - b.startTimestamp);
        });

        return Array.from(stats.values()).sort((a, b) => a.firstAppearance - b.firstAppearance);
    }, [transcript, getSpeakerTag, getPerson]);

    const toggleExpand = (id: string) => {
        setExpandedSpeakerId(prev => prev === id ? null : id);
    };

    return (
        <>
            <SheetHeader className="p-6 border-b">
                <SheetTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    {t('stats.title')} ({speakerStats.length})
                </SheetTitle>
            </SheetHeader>
            <ScrollArea className="flex-1">
                <div className="p-6 space-y-4">
                    {speakerStats.map((stat) => {
                        const isExpanded = expandedSpeakerId === stat.id;
                        const isUnknown = !stat.personId && (!stat.label || stat.label.startsWith(UNKNOWN_SPEAKER_LABEL));

                        return (
                            <div 
                                key={stat.id} 
                                className={cn(
                                    "border rounded-lg overflow-hidden transition-all",
                                    isUnknown ? "bg-amber-50/30 border-amber-200" : "bg-card border-border"
                                )}
                            >
                                <div 
                                    className="p-3 flex items-center justify-between cursor-pointer hover:bg-accent/50 transition-colors"
                                    onClick={() => toggleExpand(stat.id)}
                                >
                                    <div className="flex-1 min-w-0 pr-4">
                                        <div className="flex items-center gap-2">
                                            {stat.partyColor && (
                                                <div 
                                                    className="w-3 h-3 rounded-full shrink-0" 
                                                    style={{ backgroundColor: stat.partyColor }}
                                                />
                                            )}
                                            {!stat.partyColor && (
                                                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                                                    {isUnknown ? (
                                                        <span className="text-xs font-medium text-muted-foreground">?</span>
                                                    ) : (
                                                        <User className="h-4 w-4 text-muted-foreground" />
                                                    )}
                                                </div>
                                            )}
                                            <div className="font-medium truncate">
                                                {stat.name}
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground ml-10">
                                            <div className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {formatDuration(stat.totalDuration)}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Hash className="h-3 w-3" />
                                                {stat.segmentCount}
                                            </div>
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    </Button>
                                </div>

                                {isExpanded && (
                                    <div className="border-t bg-muted/30 p-2 max-h-60 overflow-y-auto">
                                        <div className="grid grid-cols-3 gap-2">
                                            {stat.segments.map((seg, idx) => (
                                                <Button
                                                    key={seg.id}
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 text-xs font-mono flex items-center gap-1 justify-start"
                                                    onClick={() => seekTo(seg.startTimestamp)}
                                                >
                                                    <Play className="h-3 w-3 opacity-70" />
                                                    {formatTimestamp(seg.startTimestamp)}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </ScrollArea>
        </>
    );
}

export function SpeakersOverviewSheet() {
    const t = useTranslations('editing');

    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center space-x-1"
                    title={t('actions.speakers')}
                >
                    <Users className="h-4 w-4 mr-1" />
                    <span className="hidden sm:inline">{t('actions.speakers')}</span>
                </Button>
            </SheetTrigger>
            <SheetContent className="w-[400px] sm:w-[540px] flex flex-col p-0 gap-0">
                <SpeakerStatsContent />
            </SheetContent>
        </Sheet>
    );
}

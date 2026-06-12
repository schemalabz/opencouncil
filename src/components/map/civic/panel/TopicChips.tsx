"use client"

import type { Topic } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import Icon from '@/components/icon';
import { normalizeIconName } from '@/lib/map/adapters';

/** Perceived luminance — light topic colors get Ink text instead of white. */
function isLightColor(hex: string): boolean {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!match) return false;
    const value = parseInt(match[1], 16);
    const r = (value >> 16) & 0xff;
    const g = (value >> 8) & 0xff;
    const b = value & 0xff;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.66;
}

interface TopicChipsProps {
    topics: Topic[];
    selectedTopicId: string | null;
    onChange: (topicId: string | null) => void;
    className?: string;
}

/**
 * Single-select topic filter chips, shown over the map. "Όλα" resets.
 */
export function TopicChips({ topics, selectedTopicId, onChange, className }: TopicChipsProps) {
    const t = useTranslations('map');

    return (
        <div
            className={cn(
                'flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                className,
            )}
        >
            <button
                type="button"
                onClick={() => onChange(null)}
                aria-pressed={selectedTopicId === null}
                className={cn(
                    'flex h-9 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium shadow-md transition-colors',
                    selectedTopicId === null
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-foreground hover:bg-muted',
                )}
            >
                {t('allTopics')}
            </button>
            {topics.map(topic => {
                const isSelected = selectedTopicId === topic.id;
                const iconName = normalizeIconName(topic.icon);
                const lightFill = isLightColor(topic.colorHex);
                const selectedText = lightFill ? '#0c0a09' : '#ffffff';
                return (
                    <button
                        key={topic.id}
                        type="button"
                        onClick={() => onChange(isSelected ? null : topic.id)}
                        aria-pressed={isSelected}
                        className={cn(
                            'flex h-9 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium shadow-md transition-colors',
                            !isSelected && 'bg-background text-foreground hover:bg-muted',
                        )}
                        style={isSelected
                            ? { backgroundColor: topic.colorHex, borderColor: topic.colorHex, color: selectedText }
                            : { borderColor: `${topic.colorHex}40` }}
                    >
                        {iconName && (
                            <Icon name={iconName} color={isSelected ? selectedText : topic.colorHex} size={14} />
                        )}
                        {topic.name}
                    </button>
                );
            })}
        </div>
    );
}

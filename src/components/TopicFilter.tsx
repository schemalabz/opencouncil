import { Topic } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { BadgePicker, BadgePickerOption } from './ui/badge-picker';
import { useMemo } from 'react';

interface TopicFilterProps {
    topics: Topic[];
    selectedTopicId: string | null;
    onSelectTopic: (topicId: string | null) => void;
    className?: string;
}

export function TopicFilter({
    topics,
    selectedTopicId,
    onSelectTopic,
    className
}: TopicFilterProps) {
    const t = useTranslations('Common');

    const options: BadgePickerOption<string>[] = useMemo(() =>
        topics.map(topic => ({
            value: topic.id,
            label: topic.name,
            color: topic.colorHex
        })),
        [topics]
    );

    if (topics.length === 0) {
        return null;
    }

    const selectedValues = selectedTopicId ? [selectedTopicId] : [];

    const handleSelectionChange = (values: string[]) => {
        onSelectTopic(values.length > 0 ? values[0] : null);
    };

    return (
        <BadgePicker
            options={options}
            selectedValues={selectedValues}
            onSelectionChange={handleSelectionChange}
            allLabel={t('allTopics')}
            className={className ?? "items-center my-4 px-2 sm:px-6"}
        />
    );
}

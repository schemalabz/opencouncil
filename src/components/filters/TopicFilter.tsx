'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Topic } from '@prisma/client';
import Icon from '@/components/icon';

interface TopicFilterProps {
    selectedTopics: Topic[];
    onSelect: (topic: Topic) => void;
    onRemove: (topicId: string) => void;
    onSelectAll?: () => void;
    onRemoveAll?: () => void;
}

export function TopicFilter({
    selectedTopics,
    onSelect,
    onRemove,
    onSelectAll,
    onRemoveAll
}: TopicFilterProps) {
    const [topics, setTopics] = useState<Topic[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch topics from API
    useEffect(() => {
        async function fetchTopics() {
            try {
                const response = await fetch('/api/topics');
                if (!response.ok) {
                    throw new Error('Failed to fetch topics');
                }
                const data = await response.json();
                setTopics(data);
            } catch (err) {
                setError('Υπήρξε πρόβλημα στη φόρτωση των θεμάτων');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }

        fetchTopics();
    }, []);

    const isTopicSelected = (topic: Topic) => {
        return selectedTopics.some(selected => selected.id === topic.id);
    };

    const handleTopicClick = (topic: Topic) => {
        if (isTopicSelected(topic)) {
            onRemove(topic.id);
        } else {
            onSelect(topic);
        }
    };

    const handleToggleAll = () => {
        if (selectedTopics.length === topics.length && onRemoveAll) {
            onRemoveAll();
        } else if (onSelectAll) {
            onSelectAll();
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="space-y-3">
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm flex items-center gap-2 text-red-600">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <p>{error}</p>
                </div>
            </div>
        );
    }

    const allSelected = selectedTopics.length === topics.length;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="text-sm font-medium">
                    Θέματα ({selectedTopics.length}/{topics.length})
                </div>
                {(onSelectAll || onRemoveAll) && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={handleToggleAll}
                    >
                        {allSelected ? 'Καθαρισμός όλων' : 'Επιλογή όλων'}
                    </Button>
                )}
            </div>
            <div className="grid grid-cols-1 gap-2 overflow-y-auto pr-2">
                {topics.map(topic => {
                    const isSelected = isTopicSelected(topic);
                    return (
                        <motion.div
                            key={topic.id}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <Button
                                type="button"
                                variant="outline"
                                className={cn(
                                    "w-full justify-start gap-2 overflow-hidden p-3 h-auto relative",
                                    "transition-all duration-200",
                                    isSelected && "ring-2 ring-offset-1",
                                    "hover:shadow-sm"
                                )}
                                style={{
                                    borderColor: `${topic.colorHex}${isSelected ? 'FF' : '80'}`,
                                    backgroundColor: `${topic.colorHex}${isSelected ? '20' : '10'}`,
                                    '--tw-ring-color': topic.colorHex
                                } as React.CSSProperties}
                                onClick={() => handleTopicClick(topic)}
                            >
                                <div
                                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                    style={{ backgroundColor: topic.colorHex }}
                                >
                                    <Icon
                                        name={topic.icon || "hash"}
                                        color="#ffffff"
                                        size={16}
                                    />
                                </div>
                                <div className="flex flex-col items-start overflow-hidden flex-1">
                                    <span className="font-medium truncate w-full text-sm">{topic.name}</span>
                                    {topic.name_en && (
                                        <span className="text-xs text-muted-foreground truncate w-full">{topic.name_en}</span>
                                    )}
                                </div>
                                {isSelected && (
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="absolute right-3 top-1/2 -translate-y-1/2"
                                    >
                                        <div
                                            className="w-5 h-5 rounded-full flex items-center justify-center"
                                            style={{ backgroundColor: topic.colorHex }}
                                        >
                                            <Check className="h-3 w-3 text-white" />
                                        </div>
                                    </motion.div>
                                )}
                            </Button>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}


'use client';

import { useState, useEffect } from 'react';
import { Tag, BookOpen, Home, ShieldAlert, Truck, Palette, School, Bike, Trees, AlertCircle, Loader2, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { getAllTopics } from '@/lib/db/topics';
import { Topic } from '@prisma/client';

interface TopicSelectorProps {
    selectedTopics: Topic[];
    onSelect: (topic: Topic) => void;
    onRemove: (topicId: string) => void;
    onRemoveAll?: () => void;
}

// Icons for common topics - you can expand this if needed
const TOPIC_ICONS: Record<string, React.ReactNode> = {
    'Καθαριότητα': <Trees className="h-4 w-4" />,
    'Cleanliness': <Trees className="h-4 w-4" />,
    'Ασφάλεια': <ShieldAlert className="h-4 w-4" />,
    'Safety': <ShieldAlert className="h-4 w-4" />,
    'Πολιτισμός': <Palette className="h-4 w-4" />,
    'Culture': <Palette className="h-4 w-4" />,
    'Αθλητισμός': <Bike className="h-4 w-4" />,
    'Sports': <Bike className="h-4 w-4" />,
    'Παιδεία': <School className="h-4 w-4" />,
    'Education': <School className="h-4 w-4" />,
    'Συγκοινωνίες': <Truck className="h-4 w-4" />,
    'Transportation': <Truck className="h-4 w-4" />,
    'Δημόσιοι χώροι': <Home className="h-4 w-4" />,
    'Public spaces': <Home className="h-4 w-4" />,
};

// Default icon for topics without a specific icon
const DEFAULT_ICON = <BookOpen className="h-4 w-4" />;

export function TopicSelector({
    selectedTopics,
    onSelect,
    onRemove,
    onRemoveAll
}: TopicSelectorProps) {
    const [topics, setTopics] = useState<Topic[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch topics from API
    useEffect(() => {
        async function fetchTopics() {
            try {
                const topics = await getAllTopics();

                if (!topics) {
                    throw new Error('Failed to fetch topics');
                }

                setTopics(topics);
            } catch (err) {
                setError('Υπήρξε πρόβλημα στη φόρτωση των θεμάτων');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }

        fetchTopics();
    }, []);

    // If no topics are available and loading is complete, show an error
    if (topics.length === 0 && !isLoading && !error) {
        setError('Δεν βρέθηκαν διαθέσιμα θέματα');
    }

    // Get topic icon based on name or fall back to default
    const getTopicIcon = (topic: Topic) => {
        return TOPIC_ICONS[topic.name] || TOPIC_ICONS[topic.name_en || ''] || DEFAULT_ICON;
    };

    // Check if a topic is selected
    const isTopicSelected = (topic: Topic) => {
        return selectedTopics.some(selected => selected.id === topic.id);
    };

    // Handle topic selection/deselection
    const handleTopicClick = (topic: Topic) => {
        if (isTopicSelected(topic)) {
            onRemove(topic.id);
        } else {
            onSelect(topic);
        }
    };

    // Handle bulk removal
    const handleRemoveAll = () => {
        if (onRemoveAll) {
            onRemoveAll();
        } else {
            // Fallback to individual removal if onRemoveAll is not provided
            selectedTopics.forEach(topic => onRemove(topic.id));
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-5">
                <div className="flex items-center justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="space-y-5">
                <div className="p-4 bg-red-50 border border-red-200 rounded-md text-sm flex items-center gap-2 text-red-600">
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                    <p>{error}</p>
                </div>
                <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => window.location.reload()}
                >
                    Δοκιμάστε ξανά
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div>
                {topics.length > 0 ? (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="text-sm font-medium text-gray-700">
                                Διαθέσιμα θέματα ({topics.length})
                            </div>
                            {selectedTopics.length > 0 && (
                                <Button
                                    variant="ghost"
                                    className="h-11 md:h-7 px-3 md:px-2 text-xs touch-manipulation"
                                    onClick={handleRemoveAll}
                                >
                                    Καθαρισμός όλων
                                </Button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                                            variant="outline"
                                            className={cn(
                                                "w-full justify-start gap-2 overflow-hidden p-4 md:p-3 min-h-[56px] md:min-h-0 h-auto relative",
                                                "transition-all duration-200",
                                                isSelected && "ring-2 ring-offset-2",
                                                "hover:shadow-md touch-manipulation"
                                            )}
                                            style={{
                                                borderColor: `${topic.colorHex}${isSelected ? 'FF' : '80'}`,
                                                backgroundColor: `${topic.colorHex}${isSelected ? '20' : '10'}`
                                            }}
                                            onClick={() => handleTopicClick(topic)}
                                        >
                                            <div
                                                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                                style={{ backgroundColor: topic.colorHex }}
                                            >
                                                <span className="text-white">
                                                    {getTopicIcon(topic)}
                                                </span>
                                            </div>
                                            <div className="flex flex-col items-start overflow-hidden flex-1">
                                                <span className="font-medium truncate w-full">{topic.name}</span>
                                                {topic.name_en && (
                                                    <span className="text-xs text-gray-500 truncate w-full">{topic.name_en}</span>
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
                ) : (
                    <div className="text-center p-6 border border-dashed border-gray-300 rounded-lg bg-gray-50">
                        <Tag className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                        <p className="text-gray-500 text-sm">Δεν βρέθηκαν διαθέσιμα θέματα</p>
                    </div>
                )}
            </div>
        </div>
    );
} 
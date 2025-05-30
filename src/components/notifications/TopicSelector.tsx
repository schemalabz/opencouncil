'use client';

import { useState, useEffect } from 'react';
import { X, Tag, BookOpen, Home, ShieldAlert, Truck, Palette, School, Bike, Trees, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AppTopic } from './SignupPageContent';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { getAllTopics } from '@/lib/db/topics';

interface TopicSelectorProps {
    selectedTopics: AppTopic[];
    onSelect: (topic: AppTopic) => void;
    onRemove: (topicId: string) => void;
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
    onRemove
}: TopicSelectorProps) {
    const [topics, setTopics] = useState<AppTopic[]>([]);
    const [filteredTopics, setFilteredTopics] = useState<AppTopic[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchValue, setSearchValue] = useState('');
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
                setFilteredTopics(topics);
            } catch (err) {
                setError('Υπήρξε πρόβλημα στη φόρτωση των θεμάτων');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }

        fetchTopics();
    }, []);

    // Filter topics based on search input
    useEffect(() => {
        if (searchValue.trim() === '') {
            setFilteredTopics(topics);
        } else {
            const filtered = topics.filter(topic =>
                topic.name.toLowerCase().includes(searchValue.toLowerCase()) ||
                (topic.name_en && topic.name_en.toLowerCase().includes(searchValue.toLowerCase()))
            );
            setFilteredTopics(filtered);
        }
    }, [searchValue, topics]);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchValue(e.target.value);
    };

    // Filter out already selected topics from the dropdown
    const availableTopics = filteredTopics.filter(
        topic => !selectedTopics.some(selected => selected.id === topic.id)
    );

    // If no topics are available and loading is complete, show an error
    if (topics.length === 0 && !isLoading && !error) {
        setError('Δεν βρέθηκαν διαθέσιμα θέματα');
    }

    // Get topic icon based on name or fall back to default
    const getTopicIcon = (topic: AppTopic) => {
        return TOPIC_ICONS[topic.name] || TOPIC_ICONS[topic.name_en || ''] || DEFAULT_ICON;
    };

    if (isLoading) {
        return (
            <div className="space-y-5">
                <div className="pb-2 border-b">
                    <h3 className="text-lg font-semibold">Θέματα ενδιαφέροντος</h3>
                    <p className="text-sm text-gray-600 mt-1">Επιλέξτε θέματα για τα οποία θέλετε να λαμβάνετε ενημερώσεις</p>
                </div>
                <div className="flex items-center justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="space-y-5">
                <div className="pb-2 border-b">
                    <h3 className="text-lg font-semibold">Θέματα ενδιαφέροντος</h3>
                    <p className="text-sm text-gray-600 mt-1">Επιλέξτε θέματα για τα οποία θέλετε να λαμβάνετε ενημερώσεις</p>
                </div>
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
            <div className="pb-2 border-b">
                <h3 className="text-lg font-semibold">Θέματα ενδιαφέροντος</h3>
                <p className="text-sm text-gray-600 mt-1">
                    Επιλέξτε θέματα για τα οποία θέλετε να λαμβάνετε ενημερώσεις
                </p>
            </div>

            <div>
                <div className="relative mb-4">
                    <Tag className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                        type="text"
                        placeholder="Αναζητήστε θέματα..."
                        className="pl-10 py-5"
                        value={searchValue}
                        onChange={handleSearchChange}
                    />
                    {searchValue && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6"
                            onClick={() => setSearchValue('')}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>

                {availableTopics.length > 0 ? (
                    <div className="space-y-4">
                        <div className="text-sm font-medium text-gray-700">Διαθέσιμα θέματα ({availableTopics.length})</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {availableTopics.map(topic => (
                                <motion.div
                                    key={topic.id}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <Button
                                        variant="outline"
                                        className="w-full justify-start gap-2 overflow-hidden p-3 h-auto"
                                        style={{
                                            borderColor: `${topic.colorHex}80`,
                                            backgroundColor: `${topic.colorHex}10`
                                        }}
                                        onClick={() => onSelect(topic)}
                                    >
                                        <div
                                            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                            style={{ backgroundColor: topic.colorHex }}
                                        >
                                            <span className="text-white">
                                                {getTopicIcon(topic)}
                                            </span>
                                        </div>
                                        <div className="flex flex-col items-start overflow-hidden">
                                            <span className="font-medium truncate w-full">{topic.name}</span>
                                            {topic.name_en && (
                                                <span className="text-xs text-gray-500 truncate w-full">{topic.name_en}</span>
                                            )}
                                        </div>
                                    </Button>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                ) : searchValue ? (
                    <div className="text-center p-6 border border-dashed border-gray-300 rounded-lg bg-gray-50">
                        <AlertCircle className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                        <p className="text-gray-500 text-sm">Δεν βρέθηκαν θέματα που να ταιριάζουν με &quot;{searchValue}&quot;</p>
                    </div>
                ) : selectedTopics.length === topics.length ? (
                    <div className="text-center p-6 border border-dashed border-gray-300 rounded-lg bg-gray-50">
                        <Tag className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                        <p className="text-gray-500 text-sm">Έχετε επιλέξει όλα τα διαθέσιμα θέματα</p>
                    </div>
                ) : null}
            </div>

            {selectedTopics.length > 0 && (
                <div className="mt-6 pb-2">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium">Επιλεγμένα θέματα ({selectedTopics.length})</h4>
                        {selectedTopics.length > 1 && (
                            <Button
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() => selectedTopics.forEach(topic => onRemove(topic.id))}
                            >
                                Καθαρισμός όλων
                            </Button>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {selectedTopics.map(topic => (
                            <motion.div
                                key={topic.id}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.2 }}
                                className={cn(
                                    "flex items-center gap-1 px-3 py-1.5 rounded-full text-sm border",
                                    "transition-all hover:shadow-sm"
                                )}
                                style={{
                                    backgroundColor: `${topic.colorHex}15`,
                                    borderColor: `${topic.colorHex}50`,
                                    color: topic.colorHex
                                }}
                            >
                                <span className="truncate max-w-[150px]">{topic.name}</span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 p-0 rounded-full hover:bg-white/20 ml-1"
                                    onClick={() => onRemove(topic.id)}
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
} 
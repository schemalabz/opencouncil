'use client';

import { useState, useEffect } from 'react';
import { X, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Updated Topic type to match SignupPageContent.tsx
type Topic = {
    id: string;
    name: string;
    name_en: string;
    colorHex: string;
    icon?: string;
    createdAt?: Date;
    updatedAt?: Date;
};

interface TopicSelectorProps {
    selectedTopics: Topic[];
    onSelect: (topic: Topic) => void;
    onRemove: (topicId: string) => void;
}

export function TopicSelector({
    selectedTopics,
    onSelect,
    onRemove
}: TopicSelectorProps) {
    const [topics, setTopics] = useState<Topic[]>([]);
    const [filteredTopics, setFilteredTopics] = useState<Topic[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchValue, setSearchValue] = useState('');
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
                setFilteredTopics(data);
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
                topic.name.toLowerCase().includes(searchValue.toLowerCase())
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

    // Mock topics if none are returned from API
    if (topics.length === 0 && !isLoading && !error) {
        // Add some mock topics
        const mockTopics: Topic[] = [
            { id: '1', name: 'Καθαριότητα', name_en: 'Cleanliness', colorHex: '#4CAF50' },
            { id: '2', name: 'Ασφάλεια', name_en: 'Safety', colorHex: '#2196F3' },
            { id: '3', name: 'Πολιτισμός', name_en: 'Culture', colorHex: '#9C27B0' },
            { id: '4', name: 'Αθλητισμός', name_en: 'Sports', colorHex: '#FF9800' },
            { id: '5', name: 'Παιδεία', name_en: 'Education', colorHex: '#607D8B' },
            { id: '6', name: 'Συγκοινωνίες', name_en: 'Transportation', colorHex: '#795548' },
            { id: '7', name: 'Δημόσιοι χώροι', name_en: 'Public spaces', colorHex: '#8BC34A' },
        ];
        setTopics(mockTopics);
        setFilteredTopics(mockTopics);
    }

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-medium mb-2">Θέματα ενδιαφέροντος</h3>
                    <div className="animate-pulse h-12 bg-gray-200 rounded"></div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-medium mb-2">Θέματα ενδιαφέροντος</h3>
                    <p className="text-red-500 text-sm">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div>
                <h3 className="text-lg font-medium mb-3">Θέματα ενδιαφέροντος</h3>
                <p className="text-sm text-gray-700 mb-3">
                    Επιλέξτε θέματα για τα οποία θέλετε να λαμβάνετε ενημερώσεις
                </p>
            </div>

            <div className="relative">
                <div className="relative">
                    <Tag className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                        type="text"
                        placeholder="Αναζητήστε θέματα..."
                        className="pl-10 py-5"
                        value={searchValue}
                        onChange={handleSearchChange}
                    />
                </div>

                {availableTopics.length > 0 && (
                    <div className="mt-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {availableTopics.map(topic => (
                                <Button
                                    key={topic.id}
                                    variant="outline"
                                    className="justify-start overflow-hidden p-3"
                                    style={{
                                        borderColor: topic.colorHex,
                                        backgroundColor: `${topic.colorHex}10`
                                    }}
                                    onClick={() => onSelect(topic)}
                                >
                                    <div
                                        className="w-4 h-4 rounded-full mr-3 flex-shrink-0"
                                        style={{ backgroundColor: topic.colorHex }}
                                    ></div>
                                    <span className="truncate">{topic.name}</span>
                                </Button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {selectedTopics.length > 0 && (
                <div className="mt-5">
                    <h4 className="text-sm font-medium mb-3">Επιλεγμένα θέματα:</h4>
                    <div className="flex flex-wrap gap-3">
                        {selectedTopics.map(topic => (
                            <div
                                key={topic.id}
                                className="flex items-center gap-2 px-3 py-2 rounded-full text-sm"
                                style={{
                                    backgroundColor: `${topic.colorHex}20`,
                                    borderColor: topic.colorHex,
                                    borderWidth: '1px'
                                }}
                            >
                                <div
                                    className="w-3 h-3 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: topic.colorHex }}
                                ></div>
                                <span>{topic.name}</span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 p-0 rounded-full"
                                    onClick={() => onRemove(topic.id)}
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
} 
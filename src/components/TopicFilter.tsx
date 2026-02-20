import { Topic } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { Button } from './ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { ChevronDown, Filter } from 'lucide-react';

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
    const [expanded, setExpanded] = useState(false);

    if (topics.length === 0) {
        return null;
    }

    const selectedTopic = selectedTopicId ? topics.find(t => t.id === selectedTopicId) : null;
    const label = selectedTopic ? selectedTopic.name : t('allTopics');

    return (
        <motion.div
            className={cn("flex flex-col items-center justify-center my-4 px-2 sm:px-6", className)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            {/* Mobile: collapsed toggle */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="sm:hidden flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
                <Filter className="w-3.5 h-3.5" />
                <span>{label}</span>
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")} />
            </button>

            {/* Mobile: expandable list */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="sm:hidden overflow-hidden mt-2"
                    >
                        <TopicButtons
                            topics={topics}
                            selectedTopicId={selectedTopicId}
                            onSelectTopic={(id) => {
                                onSelectTopic(id);
                                setExpanded(false);
                            }}
                            allTopicsLabel={t('allTopics')}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Desktop: always visible */}
            <div className="hidden sm:block">
                <TopicButtons
                    topics={topics}
                    selectedTopicId={selectedTopicId}
                    onSelectTopic={onSelectTopic}
                    allTopicsLabel={t('allTopics')}
                />
            </div>
        </motion.div>
    );
}

function TopicButtons({ topics, selectedTopicId, onSelectTopic, allTopicsLabel }: {
    topics: Topic[];
    selectedTopicId: string | null;
    onSelectTopic: (id: string | null) => void;
    allTopicsLabel: string;
}) {
    return (
        <div className="flex flex-wrap justify-center gap-1.5 max-w-3xl mx-auto">
            <Button
                variant={selectedTopicId === null ? "default" : "outline"}
                size="sm"
                className={cn(
                    "h-7 px-2.5 rounded-full shadow-sm text-xs",
                    selectedTopicId === null ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted/50"
                )}
                onClick={() => onSelectTopic(null)}
            >
                {allTopicsLabel}
            </Button>
            {topics.map((topic) => (
                <Button
                    key={topic.id}
                    variant={selectedTopicId === topic.id ? "default" : "outline"}
                    size="sm"
                    className={cn(
                        "h-7 px-2.5 rounded-full shadow-sm text-xs flex items-center gap-1.5",
                        selectedTopicId === topic.id
                            ? "bg-primary text-primary-foreground"
                            : "bg-background hover:bg-muted/50"
                    )}
                    onClick={() => onSelectTopic(topic.id)}
                    style={
                        selectedTopicId === topic.id
                            ? { backgroundColor: topic.colorHex, borderColor: topic.colorHex, color: '#fff' }
                            : { borderColor: `${topic.colorHex}40` }
                    }
                >
                    <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                            backgroundColor: selectedTopicId === topic.id ? '#fff' : topic.colorHex
                        }}
                    />
                    {topic.name}
                </Button>
            ))}
        </div>
    );
}

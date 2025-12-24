import { Topic } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { Button } from './ui/button';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

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
    const t = useTranslations('Statistics');

    if (topics.length === 0) {
        return null;
    }

    return (
        <motion.div
            className={cn("flex flex-col items-center justify-center my-4 px-2 sm:px-6", className)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            <div className="flex flex-wrap justify-center gap-2 sm:gap-3 max-w-3xl mx-auto">
                <Button
                    variant={selectedTopicId === null ? "default" : "outline"}
                    size="sm"
                    className={cn(
                        "min-w-[80px] h-8 sm:h-9 px-3 rounded-full shadow-sm text-xs sm:text-sm",
                        selectedTopicId === null ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted/50"
                    )}
                    onClick={() => onSelectTopic(null)}
                >
                    {t('allTopics')}
                </Button>
                {topics.map((topic) => (
                    <Button
                        key={topic.id}
                        variant={selectedTopicId === topic.id ? "default" : "outline"}
                        size="sm"
                        className={cn(
                            "h-8 sm:h-9 px-3 rounded-full shadow-sm text-xs sm:text-sm flex items-center gap-2",
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
                            className="w-2 h-2 rounded-full" 
                            style={{ 
                                backgroundColor: selectedTopicId === topic.id ? '#fff' : topic.colorHex 
                            }} 
                        />
                        {topic.name}
                    </Button>
                ))}
            </div>
        </motion.div>
    );
}
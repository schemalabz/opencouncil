import { ChatMessage } from '@/types/chat';
import { Bot, User, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LoadingBubble } from './LoadingBubble';
import { SuggestedPrompt } from './SuggestedPrompt';
import { SubjectListContainer } from '@/components/subject/SubjectListContainer';

interface MessageListProps {
    messages: ChatMessage[];
    currentMessage: ChatMessage | null;
    isLoading: boolean;
    messagesEndRef: React.RefObject<HTMLDivElement>;
    subjectScrollRef: React.RefObject<HTMLDivElement>;
    chatContainerRef: React.RefObject<HTMLDivElement>;
    onSuggestedPromptClick: (text: string) => void;
}

export function MessageList({
    messages,
    currentMessage,
    isLoading,
    messagesEndRef,
    subjectScrollRef,
    chatContainerRef,
    onSuggestedPromptClick,
}: MessageListProps) {
    const displayMessages = currentMessage
        ? [...messages, currentMessage].filter(m => m.role === 'user' || (m.role === 'assistant' && m.content))
        : messages;

    if (displayMessages.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center py-12 text-center">
                <div className="max-w-md space-y-8">
                    <div className="flex items-center justify-center">
                        <div className="p-3 rounded-full bg-[hsl(var(--orange))]/10">
                            <Sparkles className="w-8 h-8 text-[hsl(var(--orange))]" />
                        </div>
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-[hsl(var(--orange))] to-[hsl(var(--accent))] bg-clip-text text-transparent">
                            Καλώς ήρθατε στο OpenCouncil AI
                        </h2>
                        <p className="text-muted-foreground">
                            Ο έξυπνος βοηθός σας για τη δημοτική διακυβέρνηση και τις πληροφορίες του δημοτικού συμβουλίου.
                        </p>
                    </div>
                    <div className="space-y-3">
                        <SuggestedPrompt onClick={onSuggestedPromptClick}>
                            Τι έχει συζητηθεί για το κολυμβητήριο στα Χανιά;
                        </SuggestedPrompt>
                        <SuggestedPrompt onClick={onSuggestedPromptClick}>
                            Ποια πρόσφατα θέματα του δημοτικού συμβουλίου αφορούν την Παλιά Πόλη;
                        </SuggestedPrompt>
                        <SuggestedPrompt onClick={onSuggestedPromptClick}>
                            Πες μου για τα πάρκα στα Χανιά!
                        </SuggestedPrompt>
                    </div>
                </div>
            </div>
        );
    }


    return (
        <div
            ref={chatContainerRef}
            className="h-full overflow-y-auto px-4 md:px-6 py-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
        >
            <div className="max-w-3xl mx-auto">
                <div className="space-y-6 pb-4">
                    {displayMessages.map((message, index) => {
                        const isAssistant = message.role === 'assistant';
                        const isLastAssistantMessage = isAssistant && index === displayMessages.length - 1;
                        const isStreaming = message.id === currentMessage?.id;

                        return (
                            <div key={message.id || index} className={cn(
                                "flex flex-col animate-fade-in",
                                isAssistant ? "items-start" : "items-end"
                            )}>
                                <div className="flex items-start gap-3 max-w-[85%] md:max-w-[75%]">
                                    {isAssistant && (
                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[hsl(var(--orange))]/10 flex items-center justify-center">
                                            <Bot className="w-5 h-5 text-[hsl(var(--orange))]" />
                                        </div>
                                    )}
                                    <div className={cn(
                                        "rounded-2xl px-4 py-3 shadow-sm transition-all duration-200",
                                        isAssistant ? "bg-white/90 backdrop-blur-sm border border-gray-200/50" : "bg-[hsl(var(--orange))] text-white"
                                    )}>
                                        <div className="whitespace-pre-wrap break-words text-sm md:text-base">
                                            {message.content}
                                        </div>
                                    </div>
                                    {!isAssistant && (
                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[hsl(var(--accent))]/10 flex items-center justify-center">
                                            <User className="w-5 h-5 text-[hsl(var(--accent))]" />
                                        </div>
                                    )}
                                </div>

                                {/* Related subjects section */}
                                {isLastAssistantMessage && !isStreaming && message.done && message.subjectReferences && message.subjectReferences.length > 0 && (
                                    <div className="mt-4 w-full pl-11">
                                        <SubjectListContainer
                                            subjects={message.subjectReferences}
                                            layout="carousel"
                                            showContext={true}
                                            translationKey="Chat"
                                            openInNewTab={true}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {isLoading && !currentMessage && <LoadingBubble />}
                    <div ref={messagesEndRef} />
                </div>
            </div>
        </div>
    );
} 
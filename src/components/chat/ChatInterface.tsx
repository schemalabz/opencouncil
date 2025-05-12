import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubjectCard } from "@/components/subject-card";
import { City, CouncilMeeting, Party } from "@prisma/client";
import { SubjectWithRelations } from "@/lib/db/subject";
import { PersonWithRelations } from "@/lib/db/people";
import { Statistics } from "@/lib/statistics";
import { SendIcon, RefreshCw, ChevronRight, ChevronLeft, MessageSquare, Bot, User, Sparkles, Menu, Plus as PlusIcon, Pen as PenIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Enhanced SubjectWithRelations for API responses
interface EnhancedSubject extends SubjectWithRelations {
    city: City;
    meeting: CouncilMeeting;
    persons: PersonWithRelations[];
    parties: Party[];
    statistics?: Statistics;
}

// Interface for message
interface ChatMessage {
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    subjectReferences?: EnhancedSubject[];
    done?: boolean;
    error?: boolean;
}

// Remove duplicate mock messages and keep only one set
const mockMessages = [
    {
        id: '1',
        role: 'user' as const,
        content: 'What are the main responsibilities of a city council?',
    },
    {
        id: '2',
        role: 'assistant' as const,
        content: 'City councils have several key responsibilities:\n\n1. Policy Making: They create and implement policies that affect the city\'s development and residents\' quality of life.\n\n2. Budget Management: They approve the city\'s budget and oversee financial matters.\n\n3. Public Services: They ensure essential services like water, waste management, and public transportation are maintained.\n\n4. Urban Planning: They make decisions about land use, zoning, and development projects.\n\n5. Public Safety: They work with law enforcement and emergency services to maintain public safety.',
        done: true,
        subjectReferences: [],
    }
];

// Add proper TypeScript types
type CityOption = {
    value: string;
    label: string;
};

const cityOptions: CityOption[] = [
    { value: '', label: 'Όλες οι Πόλεις' },
    { value: 'athens', label: 'Αθήνα' },
    { value: 'thessaloniki', label: 'Θεσσαλονίκη' }
];

// Add LoadingBubble component
function LoadingBubble() {
    return (
        <div className="flex flex-col items-start animate-fade-in">
            <div className="flex items-start gap-3 max-w-[85%] md:max-w-[75%]">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[hsl(var(--orange))]/10 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-[hsl(var(--orange))]" />
                </div>
                <div className="rounded-2xl px-4 py-3 shadow-sm bg-white/90 backdrop-blur-sm border border-gray-200/50">
                    <div className="flex space-x-2">
                        <div className="w-2 h-2 rounded-full bg-[hsl(var(--orange))] animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 rounded-full bg-[hsl(var(--orange))] animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 rounded-full bg-[hsl(var(--orange))] animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                </div>
            </div>
        </div>
    );
}

export function ChatInterface() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [currentMessage, setCurrentMessage] = useState<ChatMessage | null>(null);
    const [isDevMode, setIsDevMode] = useState(process.env.NODE_ENV === 'development');
    const [selectedCity, setSelectedCity] = useState<string>('');

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const subjectScrollRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    // Handle scroll behavior
    useEffect(() => {
        const chatContainer = chatContainerRef.current;
        if (!chatContainer) return;

        const handleWheel = (e: WheelEvent) => {
            const { scrollTop, scrollHeight, clientHeight } = chatContainer;
            const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 1;
            const isScrollingDown = e.deltaY > 0;
            const isScrollingUp = e.deltaY < 0;

            if (isAtBottom && isScrollingDown) return;
            if (scrollTop === 0 && isScrollingUp) return;

            e.preventDefault();
            chatContainer.scrollTop += e.deltaY;
        };

        chatContainer.addEventListener('wheel', handleWheel, { passive: false });
        return () => chatContainer.removeEventListener('wheel', handleWheel);
    }, []);

    // Auto-scroll to the bottom when messages change
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, currentMessage?.content]);

    const loadMockData = () => {
        setMessages(mockMessages);
    };

    // Memoize input handlers
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setInput(e.target.value);
    }, []);

    // Memoize scroll handlers
    const scrollSubjectsLeft = useCallback(() => {
        if (subjectScrollRef.current) {
            subjectScrollRef.current.scrollBy({ left: -300, behavior: 'smooth' });
        }
    }, []);

    const scrollSubjectsRight = useCallback(() => {
        if (subjectScrollRef.current) {
            subjectScrollRef.current.scrollBy({ left: 300, behavior: 'smooth' });
        }
    }, []);

    // Memoize message filtering
    const displayMessages = useMemo(() => {
        return currentMessage
            ? [...messages, currentMessage].filter(m => m.role === 'user' || (m.role === 'assistant' && m.content))
            : messages;
    }, [messages, currentMessage]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: input,
        };

        // Add user message to the chat
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);
        setError(null);

        let tempMessage: ChatMessage | null = null;

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: [...messages, userMessage],
                }),
            });

            if (!response.ok || !response.body) {
                throw new Error('Network response was not ok');
            }

            // Create a temporary message for streaming only after we get the response
            tempMessage = {
                id: Date.now().toString(),
                role: 'assistant',
                content: '',
                done: false,
            };
            setCurrentMessage(tempMessage);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let accumulatedContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            
                            if (data.content) {
                                accumulatedContent = data.content;
                                setCurrentMessage(prev => ({
                                    ...prev!,
                                    content: accumulatedContent,
                                }));
                            }

                            if (data.done) {
                                // Update the messages array with the complete message
                                setMessages(prev => {
                                    const newMessages = [...prev];
                                    const lastMessage = newMessages[newMessages.length - 1];
                                    if (lastMessage.role === 'assistant') {
                                        newMessages[newMessages.length - 1] = {
                                            ...lastMessage,
                                            content: accumulatedContent,
                                            subjectReferences: data.subjectReferences,
                                            done: true,
                                        };
                                    } else {
                                        newMessages.push({
                                            ...tempMessage!,
                                            content: accumulatedContent,
                                            subjectReferences: data.subjectReferences,
                                            done: true,
                                        });
                                    }
                                    return newMessages;
                                });
                                setCurrentMessage(null);
                            }
                        } catch (e) {
                            console.error('Error parsing SSE data:', e);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Error sending message:', err);
            setError(err instanceof Error ? err : new Error('Unknown error occurred'));
            
            // Add error message
            setMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                if (lastMessage.role === 'assistant') {
                    newMessages[newMessages.length - 1] = {
                        ...lastMessage,
                        content: 'I apologize, but I encountered an error processing your request. Please try again.',
                        subjectReferences: [],
                        done: true,
                        error: true,
                    };
                } else {
                    newMessages.push({
                        ...tempMessage!,
                        content: 'I apologize, but I encountered an error processing your request. Please try again.',
                        subjectReferences: [],
                        done: true,
                        error: true,
                    });
                }
                return newMessages;
            });
            setCurrentMessage(null);
        } finally {
            setIsLoading(false);
            setTimeout(() => {
                inputRef.current?.focus();
            }, 100);
        }
    };

    // Handle Enter to submit, Shift+Enter for newline
    const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isLoading && input.trim()) {
                handleSubmit(e as any);
            }
        }
    }, [isLoading, input, handleSubmit]);

    // Memoize the message rendering to prevent unnecessary re-renders
    const renderMessage = useCallback((message: ChatMessage, index: number) => {
        const isAssistant = message.role === 'assistant';
        const subjectReferences = message.subjectReferences || [];
        const isLastAssistantMessage = isAssistant && index === displayMessages.length - 1;

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

                {/* Subject cards section */}
                {isLastAssistantMessage && message.done && subjectReferences && subjectReferences.length > 0 && (
                    <div className="mt-4 w-full pl-11">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-medium text-muted-foreground">
                                Related council subjects ({subjectReferences.length})
                            </p>
                            <div className="flex space-x-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full hover:bg-accent/10"
                                    onClick={scrollSubjectsLeft}
                                >
                                    <ChevronLeft size={18} />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full hover:bg-accent/10"
                                    onClick={scrollSubjectsRight}
                                >
                                    <ChevronRight size={18} />
                                </Button>
                            </div>
                        </div>

                        <div
                            ref={subjectScrollRef}
                            className="flex overflow-x-auto pb-4 space-x-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent snap-x"
                        >
                            {subjectReferences.map((subject, idx) => (
                                <div
                                    key={idx}
                                    className="flex-shrink-0 w-[300px] snap-start transition-transform duration-200 hover:scale-[1.02]"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <SubjectCard
                                        subject={subject}
                                        city={subject.city}
                                        meeting={subject.meeting}
                                        parties={subject.parties}
                                        persons={subject.persons}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }, [scrollSubjectsLeft, scrollSubjectsRight]);

    return (
        <div className="h-full flex flex-col">
            {/* Main Chat Area */}
            <main className="flex-1 overflow-hidden">
                <div 
                    ref={chatContainerRef}
                    className="h-full overflow-y-auto px-4 md:px-6 py-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
                >
                    <div className="max-w-3xl mx-auto">
                        {displayMessages.length === 0 ? (
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
                                        <SuggestedPrompt onClick={setInput}>
                                            Ποια είναι οι κύριες αρμοδιότητες ενός δημοτικού συμβουλίου;
                                        </SuggestedPrompt>
                                        <SuggestedPrompt onClick={setInput}>
                                            Πώς λειτουργεί ο δημοτικός προϋπολογισμός;
                                        </SuggestedPrompt>
                                        <SuggestedPrompt onClick={setInput}>
                                            Τι προκλήσεις αντιμετωπίζουν οι σύγχρονες πόλεις στον αστικό σχεδιασμό;
                                        </SuggestedPrompt>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6 pb-4">
                                {displayMessages.map((message, index) => {
                                    const isAssistant = message.role === 'assistant';
                                    const subjectReferences = message.subjectReferences || [];
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

                                            {/* Subject cards section */}
                                            {isLastAssistantMessage && !isStreaming && message.done && subjectReferences && subjectReferences.length > 0 && (
                                                <div className="mt-4 w-full pl-11">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <p className="text-sm font-medium text-muted-foreground">
                                                            Related council subjects ({subjectReferences.length})
                                                        </p>
                                                        <div className="flex space-x-2">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 rounded-full hover:bg-accent/10"
                                                                onClick={scrollSubjectsLeft}
                                                            >
                                                                <ChevronLeft size={18} />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 rounded-full hover:bg-accent/10"
                                                                onClick={scrollSubjectsRight}
                                                            >
                                                                <ChevronRight size={18} />
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    <div
                                                        ref={subjectScrollRef}
                                                        className="flex overflow-x-auto pb-4 space-x-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent snap-x"
                                                    >
                                                        {subjectReferences.map((subject, idx) => (
                                                            <div
                                                                key={idx}
                                                                className="flex-shrink-0 w-[300px] snap-start transition-transform duration-200 hover:scale-[1.02]"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <SubjectCard
                                                                    subject={subject}
                                                                    city={subject.city}
                                                                    meeting={subject.meeting}
                                                                    parties={subject.parties}
                                                                    persons={subject.persons}
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {isLoading && !currentMessage && <LoadingBubble />}
                                <div ref={messagesEndRef} />
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Input area */}
            <div className="border-t border-transparent bg-transparent px-2 py-4">
                <div className="max-w-3xl mx-auto">
                    <form onSubmit={handleSubmit} className="bg-background rounded-2xl shadow-md px-3 pt-2 pb-1 w-full flex flex-col gap-1 border-t-4 border-[hsl(var(--orange))]">
                        <div className="flex items-end gap-2 w-full">
                            {/* Left: Mock data button (dev only) */}
                            {isDevMode && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={loadMockData}
                                    className="rounded-full text-muted-foreground hover:text-foreground mb-1"
                                >
                                    <MessageSquare className="w-5 h-5" />
                                </Button>
                            )}
                            {/* Multiline textarea */}
                            <textarea
                                ref={inputRef as any}
                                value={input}
                                onChange={handleInputChange}
                                placeholder="Συνομιλήστε με το OpenCouncil..."
                                rows={1}
                                className="flex-1 resize-none bg-transparent border-none outline-none text-base md:text-base placeholder:text-muted-foreground text-foreground px-0 py-2 max-h-40 overflow-auto"
                                disabled={isLoading}
                                onInput={e => {
                                    const target = e.target as HTMLTextAreaElement;
                                    target.style.height = 'auto';
                                    target.style.height = `${Math.min(target.scrollHeight, 160)}px`;
                                }}
                                onKeyDown={handleTextareaKeyDown}
                            />
                        </div>
                        {/* City filter and send button below textarea, right-aligned, inside border */}
                        <div className="flex items-center justify-end w-full mt-1 px-1 gap-2">
                            <select
                                className="bg-transparent border-none outline-none text-sm font-medium text-[hsl(var(--orange))] hover:text-[hsl(var(--accent))] px-2 py-1 rounded-md cursor-pointer focus:ring-0 focus:outline-none transition-colors"
                                value={selectedCity}
                                onChange={(e) => setSelectedCity(e.target.value)}
                            >
                                {cityOptions.map(option => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                            <Button
                                type="submit"
                                disabled={isLoading || !input.trim()}
                                size="icon"
                                className="rounded-full h-8 w-8 bg-[hsl(var(--orange))] hover:bg-[hsl(var(--accent))] text-white transition-colors duration-200"
                            >
                                <SendIcon size={18} />
                                <span className="sr-only">Send</span>
                            </Button>
                        </div>
                    </form>
                    {error && (
                        <div className="mt-2 p-3 bg-red-50/90 backdrop-blur-sm border border-red-200/50 rounded-lg text-red-600 text-sm flex justify-between items-center">
                            <span>Σφάλμα: {error.message}</span>
                            <Button variant="outline" size="sm" onClick={() => {
                                setError(null);
                                setCurrentMessage(null);
                            }}>Επανάληψη</Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function SuggestedPrompt({
    children,
    onClick
}: {
    children: React.ReactNode;
    onClick: (text: string) => void;
}) {
    return (
        <button
            className="block w-full p-3 text-left border border-gray-200/50 rounded-lg hover:bg-accent/5 transition-all duration-200 text-sm md:text-base"
            onClick={() => onClick(children?.toString() || "")}
        >
            {children}
        </button>
    );
} 
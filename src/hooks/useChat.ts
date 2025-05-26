import { useState, useCallback, useRef, useEffect } from 'react';
import { ChatMessage } from '@/types/chat';
import { useRouter, useSearchParams } from 'next/navigation';

export function useChat() {
    const router = useRouter();
    const searchParams = useSearchParams();
    
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [currentMessage, setCurrentMessage] = useState<ChatMessage | null>(null);
    const [selectedCity, setSelectedCity] = useState<string>('');
    const [useMockData, setUseMockData] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const subjectScrollRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    // Update selectedCity when URL changes
    useEffect(() => {
        const cityId = searchParams.get('cityId') || '';
        setSelectedCity(cityId);
    }, [searchParams]);

    // Update URL when city changes
    const updateCitySelection = useCallback((cityId: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (cityId) {
            params.set('cityId', cityId);
        } else {
            params.delete('cityId');
        }
        router.push(`?${params.toString()}`, { scroll: false });
    }, [router, searchParams]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setInput(e.target.value);
    }, []);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: input,
        };

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
                    cityId: selectedCity || undefined,
                    useMockData
                }),
            });

            if (!response.ok || !response.body) {
                throw new Error('Network response was not ok');
            }

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
    }, [input, isLoading, messages, selectedCity, useMockData]);

    return {
        messages,
        setMessages,
        input,
        setInput,
        isLoading,
        error,
        currentMessage,
        setCurrentMessage,
        selectedCity,
        setSelectedCity: updateCitySelection,
        messagesEndRef,
        inputRef,
        subjectScrollRef,
        chatContainerRef,
        handleInputChange,
        handleSubmit,
        setError,
        useMockData,
        setUseMockData,
    };
} 
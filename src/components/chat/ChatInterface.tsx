import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { SendIcon, MessageSquare } from "lucide-react";
import { useChat } from "@/hooks/useChat";
import { MessageList } from "./MessageList";
import { mockMessages } from "@/lib/mock-data";
import { getCities, getCity } from "@/lib/db/cities";
import Combobox from "@/components/Combobox";
import { City } from "@prisma/client";


export function ChatInterface() {
    const submitButtonRef = useRef<HTMLButtonElement>(null);
    const [shouldSubmit, setShouldSubmit] = useState(false);
    const {
        messages,
        setMessages,
        input,
        setInput,
        isLoading,
        error,
        currentMessage,
        setCurrentMessage,
        selectedCity,
        setSelectedCity,
        messagesEndRef,
        inputRef,
        subjectScrollRef,
        chatContainerRef,
        handleInputChange,
        handleSubmit,
        setError,
    } = useChat();

    const [isDevMode] = useState(process.env.NODE_ENV === 'development');
    const [cityOptions, setCityOptions] = useState<string[]>(['Όλες οι πόλεις']);
    const [cities, setCities] = useState<City[]>([]);

    // Load cities on component mount and handle selected city
    useEffect(() => {
        const loadCities = async () => {
            try {
                const fetchedCities = await getCities();
                setCities(fetchedCities);
                const options = [
                    'Όλες οι πόλεις',
                    ...fetchedCities.map(city => city.name)
                ];

                // If there's a selected city that's not in the default list, try to fetch it
                if (selectedCity && !fetchedCities.some(city => city.id === selectedCity)) {
                    const additionalCity = await getCity(selectedCity);
                    if (additionalCity) {
                        options.push(additionalCity.name);
                        setCities(prev => [...prev, additionalCity]);
                    } else {
                        console.log(`City with ID ${selectedCity} not found`);
                    }
                }

                setCityOptions(options);
            } catch (error) {
                console.error('Error loading cities:', error);
            }
        };
        loadCities();
    }, [selectedCity]);

    // Get the current city name based on selectedCity ID
    const getCurrentCityName = () => {
        if (!selectedCity) return null;
        const city = cities.find(c => c.id === selectedCity);
        return city?.name ?? null;
    };

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
    }, [chatContainerRef]);

    // Auto-scroll to the bottom when messages change
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, currentMessage?.content, messagesEndRef]);

    const loadMockData = () => {
        setMessages(mockMessages);
    };

    // Handle Enter to submit, Shift+Enter for newline
    const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isLoading && input.trim()) {
                handleSubmit(e as any);
            }
        }
    };

    // Effect to handle button click after input changes
    useEffect(() => {
        if (shouldSubmit && input.trim()) {
            submitButtonRef.current?.click();
            setShouldSubmit(false);
        }
    }, [input, shouldSubmit]);

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col">
            {/* Main Chat Area */}
            <main className="flex-1 overflow-y-auto">
                <MessageList
                    messages={messages}
                    currentMessage={currentMessage}
                    isLoading={isLoading}
                    messagesEndRef={messagesEndRef}
                    subjectScrollRef={subjectScrollRef}
                    chatContainerRef={chatContainerRef}
                    onSuggestedPromptClick={(text) => {
                        setInput(text);
                        setShouldSubmit(true);
                    }}
                />
            </main>

            {/* Input area - Fixed at bottom */}
            <div className="flex-shrink-0 border-t border-transparent bg-transparent px-2 py-4">
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
                            <Combobox
                                options={cityOptions}
                                value={getCurrentCityName()}
                                onChange={(value) => {
                                    if (!value || value === 'Όλες οι πόλεις') {
                                        setSelectedCity('');
                                    } else {
                                        const city = cities.find(c => c.name === value);
                                        if (city) {
                                            setSelectedCity(city.id);
                                        }
                                    }
                                }}
                                placeholder="Όλες οι πόλεις"
                                variant="minimal"
                            />
                            <Button
                                ref={submitButtonRef}
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

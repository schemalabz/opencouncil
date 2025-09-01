"use client";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { SendIcon, Database, AlertTriangle } from "lucide-react";
import { useChat } from "@/hooks/useChat";
import { MessageList } from "./MessageList";
import { getCities, getCity } from "@/lib/db/cities";
import Combobox from "@/components/Combobox";
import { City } from "@prisma/client";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { IS_DEV } from "@/lib/utils";

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
        useMockData,
        setUseMockData,
        isTemporarilyDisabled,
    } = useChat();

    const [cities, setCities] = useState<City[]>([]);

    // Load cities on component mount and handle selected city
    useEffect(() => {
        const loadCities = async () => {
            try {
                const fetchedCities = await getCities();
                setCities(fetchedCities);

                // If there's a selected city that's not in the default list, try to fetch it
                if (selectedCity && !fetchedCities.some(city => city.id === selectedCity)) {
                    const additionalCity = await getCity(selectedCity);
                    if (additionalCity) {
                        setCities(prev => [...prev, additionalCity]);
                    } else {
                        console.log(`City with ID ${selectedCity} not found`);
                    }
                }
            } catch (error) {
                console.error('Error loading cities:', error);
            }
        };
        loadCities();
    }, [selectedCity]);

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
            {/* Temporary maintenance message */}
            {isTemporarilyDisabled && (
                <div className="max-w-7xl mx-auto w-full px-4 mt-4">
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-center gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                            <div>
                                <h3 className="font-medium text-amber-800">Προσωρινή Διακοπή Λειτουργίας</h3>
                                <p className="text-sm text-amber-700 mt-1">
                                    Η λειτουργία συνομιλίας είναι προσωρινά μη διαθέσιμη λόγω συντήρησης του συστήματος.
                                    Παρακαλούμε δοκιμάστε ξανά αργότερα.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
                        if (!isTemporarilyDisabled) {
                            setInput(text);
                            setShouldSubmit(true);
                        }
                    }}
                />
            </main>

            {/* Input area - Fixed at bottom */}
            <div className="flex-shrink-0 border-t border-transparent bg-transparent px-2 py-4">
                <div className="max-w-3xl mx-auto">
                    <form onSubmit={handleSubmit} className="bg-background rounded-2xl shadow-md px-3 pt-2 pb-1 w-full flex flex-col gap-1 border-t-4 border-[hsl(var(--orange))]">
                        <div className="flex items-end gap-2 w-full">
                            {/* Multiline textarea */}
                            <textarea
                                ref={inputRef as any}
                                value={input}
                                onChange={handleInputChange}
                                placeholder={isTemporarilyDisabled ? "Η συνομιλία είναι προσωρινά απενεργοποιημένη..." : "Συνομιλήστε με το OpenCouncil..."}
                                rows={1}
                                className="flex-1 resize-none bg-transparent border-none outline-none text-base md:text-base placeholder:text-muted-foreground text-foreground px-0 py-2 max-h-40 overflow-auto"
                                disabled={isLoading || isTemporarilyDisabled}
                                onInput={e => {
                                    const target = e.target as HTMLTextAreaElement;
                                    target.style.height = 'auto';
                                    target.style.height = `${Math.min(target.scrollHeight, 160)}px`;
                                }}
                                onKeyDown={handleTextareaKeyDown}
                            />
                        </div>
                        {/* City filter, seed data toggle, and send button below textarea */}
                        <div className="flex items-center justify-between w-full mt-1 px-1 gap-2">
                            <div className="flex items-center gap-2">
                                <Combobox
                                    items={cities}
                                    value={cities.find(c => c.id === selectedCity) ?? null}
                                    onChange={(city) => {
                                        if (!city) {
                                            setSelectedCity('');
                                        } else {
                                            setSelectedCity(city.id);
                                        }
                                    }}
                                    placeholder="Όλες οι πόλεις"
                                    variant="minimal"
                                    getItemLabel={(city) => city.name}
                                    getItemValue={(city) => city.name}
                                    disabled={isTemporarilyDisabled}
                                />
                                {IS_DEV && (
                                    <div className="flex items-center gap-2">
                                        <Database className="w-4 h-4 text-muted-foreground" />
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                id="seed-data"
                                                checked={useMockData}
                                                onCheckedChange={setUseMockData}
                                                disabled={isTemporarilyDisabled}
                                            />
                                            <Label htmlFor="seed-data" className="text-sm text-muted-foreground">
                                                mock data
                                            </Label>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <Button
                                ref={submitButtonRef}
                                type="submit"
                                disabled={isLoading || !input.trim() || isTemporarilyDisabled}
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

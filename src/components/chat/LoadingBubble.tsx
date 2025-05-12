import { Bot } from 'lucide-react';

export function LoadingBubble() {
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
import { Bot } from "lucide-react";

interface AISummaryCardProps {
    summary: string;
}

export default function AISummaryCard({ summary }: AISummaryCardProps) {
    return (
        <div className="w-full bg-muted/30 rounded-lg p-3 border border-muted/50 relative">
            <p className="text-muted-foreground leading-relaxed pr-16 md:pr-20 text-sm">{summary}</p>
            <div className="absolute bottom-2 right-2 md:right-3 flex items-center gap-1 text-xs text-muted-foreground/70">
                <Bot className="h-3 w-3" />
                <span className="hidden sm:inline">Σύνοψη ΑΙ</span>
                <span className="sm:hidden">ΑΙ</span>
            </div>
        </div>
    );
} 
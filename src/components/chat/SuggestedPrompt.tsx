interface SuggestedPromptProps {
    children: React.ReactNode;
    onClick: (text: string) => void;
}

export function SuggestedPrompt({ children, onClick }: SuggestedPromptProps) {
    return (
        <button
            className="block w-full p-3 text-left border border-gray-200/50 rounded-lg hover:bg-accent/5 transition-all duration-200 text-sm md:text-base"
            onClick={() => onClick(children?.toString() || "")}
        >
            {children}
        </button>
    );
} 
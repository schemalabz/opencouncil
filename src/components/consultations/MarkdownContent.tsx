import ReactMarkdown from 'react-markdown';

interface MarkdownContentProps {
    content: string;
    className?: string;
    variant?: 'default' | 'muted';
}

export default function MarkdownContent({
    content,
    className = "",
    variant = 'default'
}: MarkdownContentProps) {
    const baseClasses = "prose prose-sm max-w-none";
    const variantClasses = variant === 'muted' ? 'text-muted-foreground' : 'text-foreground/90';

    const stylingClasses = [
        // Left-align all headings (override global centering)
        "[&_h1]:text-left",
        "[&_h2]:text-left",
        "[&_h3]:text-left",
        "[&_h4]:text-left",
        "[&_h5]:text-left",
        "[&_h6]:text-left",

        // Heading spacing
        "[&_h1]:mt-8",
        "[&_h1]:mb-4",
        "[&_h2]:mt-6",
        "[&_h2]:mb-3",
        "[&_h3]:mt-5",
        "[&_h3]:mb-3",
        "[&_h4]:mt-4",
        "[&_h4]:mb-2",
        "[&_h5]:mt-4",
        "[&_h5]:mb-2",
        "[&_h6]:mt-3",
        "[&_h6]:mb-2",

        // Paragraph spacing
        "[&_p]:mb-4",
        "[&_p]:leading-relaxed",

        // List styling
        "[&_ul]:mb-4",
        "[&_ul]:mt-2",
        "[&_ul]:space-y-1",
        "[&_ul]:ml-6",
        "[&_ul]:list-disc",
        "[&_ul]:list-outside",
        "[&_ul_li]:leading-relaxed",
        "[&_ul_li]:ml-0",

        // Ordered list styling
        "[&_ol]:mb-4",
        "[&_ol]:mt-2",
        "[&_ol]:space-y-1",
        "[&_ol]:ml-4",
        "[&_ol_li]:pl-2",
        "[&_ol_li]:leading-relaxed",

        // Nested list spacing
        "[&_ul_ul]:mt-1",
        "[&_ul_ul]:mb-1",
        "[&_ol_ol]:mt-1",
        "[&_ol_ol]:mb-1",

        // Other elements
        "[&_blockquote]:border-l-4",
        "[&_blockquote]:border-muted",
        "[&_blockquote]:pl-4",
        "[&_blockquote]:italic",
        "[&_blockquote]:my-4",

        "[&_code]:bg-muted",
        "[&_code]:px-1",
        "[&_code]:py-0.5",
        "[&_code]:rounded",
        "[&_code]:text-sm",

        "[&_pre]:bg-muted",
        "[&_pre]:p-4",
        "[&_pre]:rounded-lg",
        "[&_pre]:overflow-x-auto",
        "[&_pre]:my-4"
    ].join(" ");

    const allClasses = `${baseClasses} ${variantClasses} ${stylingClasses} ${className}`.trim();

    return (
        <div className={allClasses}>
            <ReactMarkdown>{content}</ReactMarkdown>
        </div>
    );
} 
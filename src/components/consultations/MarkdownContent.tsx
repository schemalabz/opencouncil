import ReactMarkdown from 'react-markdown';
import { Link2Off, Map, BookOpen } from 'lucide-react';
import { ReferenceFormat, RegulationData } from './types';

interface MarkdownContentProps {
    content: string;
    className?: string;
    variant?: 'default' | 'muted';
    referenceFormat?: ReferenceFormat;
    onReferenceClick?: (referenceId: string) => void;
    regulationData?: RegulationData;
}

export default function MarkdownContent({
    content,
    className = "",
    variant = 'default',
    referenceFormat,
    onReferenceClick,
    regulationData
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
        "[&_ol]:ml-6",
        "[&_ol]:list-decimal",
        "[&_ol]:list-outside",
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

    // Check if we have reference handling enabled
    const hasReferenceHandling = Boolean(referenceFormat || onReferenceClick);

    // Preprocess content to convert {REF:...} to markdown links
    const preprocessContent = (text: string): string => {
        if (!hasReferenceHandling) return text;

        const pattern = referenceFormat?.pattern || "{REF:([a-zA-Z][a-zA-Z0-9_-]*)}";
        const regex = new RegExp(pattern, 'gi');

        return text.replace(regex, (match, referenceId) => {
            // Determine reference type to decide on link format
            let isDocumentReference = false;

            if (regulationData?.regulation) {
                for (const item of regulationData.regulation) {
                    // Check if it's a chapter or article
                    if ((item.type === 'chapter' && item.id === referenceId) ||
                        (item.type === 'chapter' && item.articles?.some(a => a.id === referenceId))) {
                        isDocumentReference = true;
                        break;
                    }
                }
            }

            if (isDocumentReference) {
                // For chapters/articles, use direct anchor links
                return `[${match}](#${referenceId})`;
            } else {
                // For geosets/geometries, use ref- prefix for custom handling
                return `[${match}](#ref-${referenceId})`;
            }
        });
    };

    const processedContent = preprocessContent(content);

    return (
        <div className={allClasses}>
            <ReactMarkdown
                components={hasReferenceHandling ? {
                    // Custom link renderer to handle ref:// links
                    a: ({ href, children, ...props }) => {
                        // Helper function to resolve reference info
                        const resolveReference = (referenceId: string) => {
                            let displayName = referenceId;
                            let referenceType: 'chapter' | 'article' | 'geoset' | 'geometry' | 'unknown' = 'unknown';
                            let isValid = false;

                            if (regulationData?.regulation) {
                                for (const item of regulationData.regulation) {
                                    // Check if it's a chapter or geoset (direct match)
                                    if (item.id === referenceId) {
                                        if (item.type === 'chapter') {
                                            displayName = item.title || referenceId;
                                            referenceType = 'chapter';
                                        } else if (item.type === 'geoset') {
                                            displayName = item.name || referenceId;
                                            referenceType = 'geoset';
                                        }
                                        isValid = true;
                                        break;
                                    }

                                    // Check articles within chapters
                                    if (item.type === 'chapter' && item.articles) {
                                        const article = item.articles.find(a => a.id === referenceId);
                                        if (article) {
                                            displayName = article.title;
                                            referenceType = 'article';
                                            isValid = true;
                                            break;
                                        }
                                    }

                                    // Check geometries within geosets
                                    if (item.type === 'geoset' && item.geometries) {
                                        const geometry = item.geometries.find(g => g.id === referenceId);
                                        if (geometry) {
                                            displayName = geometry.name;
                                            referenceType = 'geometry';
                                            isValid = true;
                                            break;
                                        }
                                    }
                                }
                            }

                            return { displayName, referenceType, isValid };
                        };

                        // Helper function to get appropriate icon
                        const getIcon = (referenceType: string) => {
                            if (referenceType === 'geoset' || referenceType === 'geometry') {
                                return <Map className="h-3 w-3" />;
                            } else if (referenceType === 'chapter' || referenceType === 'article') {
                                return <BookOpen className="h-3 w-3" />;
                            }
                            return null;
                        };

                        // Handle custom references (geosets/geometries)
                        if (href?.startsWith('#ref-')) {
                            const referenceId = href.replace('#ref-', '');
                            const { displayName, referenceType, isValid } = resolveReference(referenceId);

                            if (isValid && onReferenceClick) {
                                return (
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            onReferenceClick(referenceId);
                                        }}
                                        className="text-blue-600 hover:text-blue-800 hover:underline font-medium inline text-left"
                                        type="button"
                                        title={`Navigate to: ${displayName}`}
                                    >
                                        {getIcon(referenceType) && <span className="inline-block mr-1 align-baseline">{getIcon(referenceType)}</span>}
                                        <span className="inline">{displayName}</span>
                                    </button>
                                );
                            } else if (!isValid) {
                                return (
                                    <span
                                        className="text-red-600 font-medium inline"
                                        title={`Broken reference: ${referenceId}`}
                                    >
                                        <span className="inline">{displayName}</span>
                                        <span className="inline-block ml-1 align-baseline"><Link2Off className="h-3 w-3" /></span>
                                    </span>
                                );
                            } else {
                                return (
                                    <span
                                        className="text-gray-600 font-medium inline"
                                        title={`Reference: ${displayName}`}
                                    >
                                        {getIcon(referenceType) && <span className="inline-block mr-1 align-baseline">{getIcon(referenceType)}</span>}
                                        <span className="inline">{displayName}</span>
                                    </span>
                                );
                            }
                        }

                        // Handle document references (chapters/articles) - check if it's a reference link
                        if (href?.startsWith('#') && typeof children === 'string' && children.includes('{REF:')) {
                            // Extract reference ID from the href
                            const referenceId = href.substring(1); // Remove #
                            const { displayName, referenceType, isValid } = resolveReference(referenceId);

                            if (isValid) {
                                return (
                                    <a
                                        href={href}
                                        className="text-blue-600 hover:text-blue-800 hover:underline font-medium inline text-left"
                                        title={`Navigate to: ${displayName}`}
                                    >
                                        {getIcon(referenceType) && <span className="inline-block mr-1 align-baseline">{getIcon(referenceType)}</span>}
                                        <span className="inline">{displayName}</span>
                                    </a>
                                );
                            } else {
                                return (
                                    <span
                                        className="text-red-600 font-medium inline"
                                        title={`Broken reference: ${referenceId}`}
                                    >
                                        <span className="inline">{displayName}</span>
                                        <span className="inline-block ml-1 align-baseline"><Link2Off className="h-3 w-3" /></span>
                                    </span>
                                );
                            }
                        }

                        // Regular link
                        return <a href={href} className="text-blue-600 hover:underline">{children}</a>;
                    }
                } : undefined}
            >
                {processedContent}
            </ReactMarkdown>
        </div>
    );
} 
"use client";

import { ReferenceType } from "@/lib/referenceUtils";
import { Badge } from "./ui/badge";
import ReactMarkdown from 'react-markdown';

interface FormattedTextDisplayProps {
    text: string; // Markdown with REF:TYPE:ID links
    onUtteranceClick?: (utteranceId: string) => void;
    meetingId?: string;
    cityId?: string;
    linkColor?: 'blue' | 'black'; // Optional link color override
}

export function FormattedTextDisplay({
    text,
    onUtteranceClick,
    meetingId,
    cityId,
    linkColor = 'blue'
}: FormattedTextDisplayProps) {
    const linkClassName = linkColor === 'black'
        ? 'text-foreground underline hover:opacity-80'
        : 'underline hover:opacity-80';
    const linkStyle = linkColor === 'blue' ? { color: 'hsl(213 49% 73%)' } : undefined;

    // Helper to render entity links (person, subject) with optional context
    const renderEntityLink = (entityType: string, id: string, children: React.ReactNode) => {
        if (meetingId && cityId) {
            return (
                <a
                    href={`/${cityId}/${meetingId}/${entityType}/${id}`}
                    className={`${linkClassName} inline`}
                    style={linkStyle}
                >
                    {children}
                </a>
            );
        }
        return <span className="inline">{children}</span>;
    };

    return (
        <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown
                urlTransform={(url) => url} // Pass through all URLs unchanged
                components={{
                    // Custom link renderer to handle REF:TYPE:ID links
                    a: ({ href, children }) => {
                        if (!href || !href.startsWith('REF:')) {
                            // Regular link
                            return <a href={href} target="_blank" rel="noopener noreferrer" className={linkClassName} style={linkStyle}>{children}</a>;
                        }

                        // Parse REF:TYPE:ID
                        const match = href.match(/REF:(UTTERANCE|PERSON|PARTY|SUBJECT):(.+)/);
                        if (!match) return <span>{children}</span>;

                        const [, type, id] = match;
                        const refType = type.toLowerCase() as ReferenceType;

                        switch (refType) {
                            case 'utterance':
                                // Use API endpoint for utterance links to enable proper navigation
                                // Use <a> tag instead of Link to avoid locale prefix on API routes
                                return (
                                    <a
                                        href={`/api/utterance/${id}`}
                                        onClick={(e) => {
                                            // If we're in the same meeting context, use the in-page navigation
                                            if (onUtteranceClick) {
                                                e.preventDefault();
                                                onUtteranceClick(id);
                                            }
                                        }}
                                        className={`${linkClassName} cursor-pointer inline`}
                                        style={linkStyle}
                                    >
                                        {children}
                                    </a>
                                );

                            case 'person':
                                return renderEntityLink('people', id, children);

                            case 'party':
                                return (
                                    <Badge variant="outline" className="mx-1 inline-flex">
                                        {children}
                                    </Badge>
                                );

                            case 'subject':
                                return renderEntityLink('subjects', id, children);

                            default:
                                return <span>{children}</span>;
                        }
                    }
                }}
            >
                {text}
            </ReactMarkdown>
        </div>
    );
}

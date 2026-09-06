"use client";

import { memo, useMemo } from "react";
import { useLocale } from "next-intl";
import { ReferenceType } from "@/lib/utils/references";
import { Badge } from "./ui/badge";
import ReactMarkdown from 'react-markdown';
import type { Element, ElementContent } from 'hast';
import { UtteranceReferenceLink } from "./meetings/subject/UtteranceReferenceLink";
import { serbianScriptForLocale, toScript, type SerbianScript } from "@/lib/serbian";

// Rehype plugin transliterating only TEXT nodes to the active Serbian script.
// Operating on the hast tree (rather than the raw markdown string) keeps
// hrefs — REF:TYPE:<id> links whose ids must stay byte-exact, external URLs —
// untouched while link labels and all prose are converted.
const makeRehypeTransliterate = (script: SerbianScript) => () => (tree: { type: string; value?: string; children?: unknown[] }) => {
    const walk = (node: { type: string; value?: string; children?: unknown[] }) => {
        if (node.type === 'text' && typeof node.value === 'string') {
            node.value = toScript(node.value, script);
        }
        node.children?.forEach((child) => walk(child as { type: string; value?: string; children?: unknown[] }));
    };
    walk(tree);
};

// True when the subtree holds an utterance reference. Such a reference expands
// into a mini transcript, which is block content.
const hasUtteranceReference = (node: Element | ElementContent | undefined): boolean => {
    if (!node || node.type !== 'element') return false;
    if (node.tagName === 'a' && typeof node.properties.href === 'string'
        && node.properties.href.startsWith('REF:UTTERANCE:')) {
        return true;
    }
    return node.children.some(hasUtteranceReference);
};

interface FormattedTextDisplayProps {
    text: string; // Markdown with REF:TYPE:ID links
    onUtteranceClick?: (utteranceId: string) => void;
    meetingId?: string;
    cityId?: string;
    linkColor?: 'blue' | 'black'; // Optional link color override
    /**
     * Use on pages that aren't inside a CouncilMeetingDataProvider (e.g. the Person page),
     * where the expansion mini-transcript cannot resolve utterance data.
     */
    disableUtteranceExpansion?: boolean;
}

export const FormattedTextDisplay = memo(function FormattedTextDisplay({
    text,
    onUtteranceClick,
    meetingId,
    cityId,
    linkColor = 'blue',
    disableUtteranceExpansion = false,
}: FormattedTextDisplayProps) {
    const locale = useLocale();
    const script = serbianScriptForLocale(locale);
    const rehypePlugins = useMemo(() => (script ? [makeRehypeTransliterate(script)] : []), [script]);
    const linkClassName = linkColor === 'black'
        ? 'text-foreground underline hover:opacity-80'
        : 'underline hover:opacity-80';
    const linkStyle = linkColor === 'blue' ? { color: 'hsl(213 49% 73%)' } : undefined;

    // Helper to render entity links (person, subject) with optional context
    const renderEntityLink = (entityType: 'people' | 'subjects', id: string, children: React.ReactNode) => {
        if (!cityId) return <span className="inline">{children}</span>;

        // People links are direct: /city/people/id
        // Subject links are meeting-scoped: /city/meeting/subjects/id
        const href = entityType === 'people'
            ? `/${cityId}/people/${id}`
            : meetingId ? `/${cityId}/${meetingId}/subjects/${id}` : null;

        if (!href) return <span className="inline">{children}</span>;

        return (
            <a
                href={href}
                className={`${linkClassName} inline`}
                style={linkStyle}
            >
                {children}
            </a>
        );
    };

    return (
        <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown
                urlTransform={(url) => url} // Pass through all URLs unchanged
                rehypePlugins={rehypePlugins}
                components={{
                    // A block element inside a <p> is invalid HTML. Only a paragraph
                    // that can hold the block-level mini transcript renders as a <div>.
                    // Every other paragraph stays a <p> and keeps the `prose` styles.
                    // The margin repeats the paragraph spacing of `prose-sm`.
                    p: ({ node, children }) => (
                        !disableUtteranceExpansion && hasUtteranceReference(node)
                            ? <div className="my-4">{children}</div>
                            : <p>{children}</p>
                    ),

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
                                if (disableUtteranceExpansion) {
                                    return (
                                        <span className={`${linkClassName} inline`} style={linkStyle}>
                                            {children}
                                        </span>
                                    );
                                }
                                return (
                                    <UtteranceReferenceLink
                                        utteranceId={id}
                                        linkColor={linkColor}
                                    >
                                        {children}
                                    </UtteranceReferenceLink>
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
});

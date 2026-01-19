"use client"

import { useState, useRef, useEffect } from "react"
import { Bot, ChevronDown, ChevronUp, LinkIcon, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import ReactMarkdown from "react-markdown"
import type { Components } from "react-markdown"
import React from "react"

// Maximum height in pixels before collapsing
const MAX_CONTENT_HEIGHT = 120

// Define Subject type if not imported from Prisma
type Subject = {
    id: string
    name: string
    context?: string | null
    contextCitationUrls?: string[] | null
}

export function SubjectContext({ subject }: { subject: Subject }) {
    const [showSources, setShowSources] = useState(false)
    const [expanded, setExpanded] = useState(false)
    const [shouldCollapse, setShouldCollapse] = useState(true) // Always collapsible by default
    const contentRef = useRef<HTMLDivElement>(null)

    const markdownComponents: Components = {
        h1: ({ node, ...props }) => <h2 className="text-left text-base font-semibold mt-3 mb-2" {...props} />,
        h2: ({ node, ...props }) => <h2 className="text-left text-base font-semibold mt-3 mb-2" {...props} />,
        h3: ({ node, ...props }) => <h3 className="text-left text-sm font-medium mt-2 mb-1.5" {...props} />,
        h4: ({ node, ...props }) => <h3 className="text-left text-sm font-medium mt-2 mb-1.5" {...props} />,
        a: ({ node, href, children, ...props }) => (
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:opacity-80 transition-colors"
                style={{ color: 'hsl(213 49% 73%)' }}
                {...props}
            >
                {children}
            </a>
        ),
        p: ({ node, children, ...props }) => {
            // Reuse the same processContent function logic
            const processContent = (content: React.ReactNode): React.ReactNode => {
                if (typeof content === 'string') {
                    return <CitationText text={content} urls={subject.contextCitationUrls} />;
                }

                if (React.isValidElement(content)) {
                    const childrenArray = React.Children.toArray(content.props.children);

                    if (childrenArray.length === 0) {
                        return content;
                    }

                    const processedChildren = React.Children.map(
                        childrenArray,
                        child => processContent(child)
                    );

                    return React.cloneElement(content, { ...content.props }, processedChildren);
                }

                if (Array.isArray(content)) {
                    return React.Children.map(content, processContent);
                }

                return content;
            };

            return (
                <p className="text-left my-2 leading-relaxed" {...props}>
                    {processContent(children)}
                </p>
            );
        },
        ul: ({ node, ...props }) => <ul className="list-disc pl-5 my-2" {...props} />,
        ol: ({ node, ...props }) => <ol className="list-decimal pl-5 my-2" {...props} />,
        li: ({ node, children, ...props }) => {
            // Helper function to process content recursively
            const processContent = (content: React.ReactNode): React.ReactNode => {
                if (typeof content === 'string') {
                    return <CitationText text={content} urls={subject.contextCitationUrls} />;
                }

                if (React.isValidElement(content)) {
                    // Process children of React elements recursively
                    const childrenArray = React.Children.toArray(content.props.children);

                    if (childrenArray.length === 0) {
                        return content;
                    }

                    const processedChildren = React.Children.map(
                        childrenArray,
                        child => processContent(child)
                    );

                    return React.cloneElement(content, { ...content.props }, processedChildren);
                }

                // If it's an array (like React fragments), process each item
                if (Array.isArray(content)) {
                    return React.Children.map(content, processContent);
                }

                return content;
            };

            return (
                <li className="my-1" {...props}>
                    {processContent(children)}
                </li>
            );
        }
    }

    // Check if content needs collapse/expand functionality
    useEffect(() => {
        if (contentRef.current) {
            setShouldCollapse(contentRef.current.scrollHeight > MAX_CONTENT_HEIGHT)
        }
    }, [subject.context])

    if (!subject.context && (!subject.contextCitationUrls || subject.contextCitationUrls.length === 0)) {
        return null
    }

    return (
        <Card className="overflow-hidden border-muted/60">
            <CardHeader className="pb-2 space-y-1">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                    <Bot className="h-5 w-5 text-primary" />
                    Πληροφορίες από το διαδίκτυο
                </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3 pt-0">
                {subject.context && (
                    <div className="relative">
                        <div
                            ref={contentRef}
                            style={{ maxHeight: expanded ? "none" : `${MAX_CONTENT_HEIGHT}px` }}
                            className={cn(
                                "text-sm text-muted-foreground pl-4 border-l-2 border-primary/20 py-1",
                                !expanded && "overflow-hidden",
                            )}
                        >
                            <ReactMarkdown components={markdownComponents}>{subject.context}</ReactMarkdown>
                        </div>

                        {shouldCollapse && !expanded && (
                            <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-background to-transparent pointer-events-none" />
                        )}

                        {shouldCollapse && (
                            <div className="flex justify-center mt-1 relative z-10">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 rounded-full px-3 text-xs font-medium hover:bg-muted/80 transition-colors bg-background shadow-sm"
                                    onClick={() => setExpanded(!expanded)}
                                >
                                    {expanded ? (
                                        <span className="flex items-center gap-1">
                                            Λιγότερα <ChevronUp className="h-3.5 w-3.5" />
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1">
                                            Περισσότερα <ChevronDown className="h-3.5 w-3.5" />
                                        </span>
                                    )}
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {subject.contextCitationUrls && subject.contextCitationUrls.length > 0 && (
                    <div className="space-y-2 pt-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-between h-8 px-3 hover:bg-muted/80 transition-colors"
                            onClick={() => setShowSources(!showSources)}
                        >
                            <span className="text-xs font-medium flex items-center gap-1.5">
                                <LinkIcon className="h-3.5 w-3.5 text-primary" />
                                Πηγές ({subject.contextCitationUrls.length})
                            </span>
                            {showSources ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </Button>
                        {showSources && (
                            <div className="pl-4 space-y-2 border-l-2 border-primary/20 py-1">
                                {subject.contextCitationUrls.map((url, index) => (
                                    <a
                                        key={index}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors group"
                                    >
                                        <div className="flex items-center justify-center w-4 h-4 rounded-full bg-muted text-[10px] font-medium">
                                            {index + 1}
                                        </div>
                                        <span className="truncate flex-1">{url}</span>
                                        <ExternalLink className="h-3 w-3 group-hover:text-primary transition-colors shrink-0" />
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

function CitationText({ text, urls }: { text: string, urls: string[] | null | undefined }) {
    // Enhanced regex to catch citations with or without spaces
    const parts = text.split(/(\[\s*\d+\s*\])/g)

    return (
        <>
            {parts.map((part, i) => {
                const match = part.match(/\[\s*(\d+)\s*\]/)
                if (match) {
                    const index = parseInt(match[1]) - 1
                    if (index >= 0 && urls?.[index]) {
                        return (
                            <button
                                key={i}
                                onClick={() => {
                                    window.open(urls[index], '_blank', 'noopener,noreferrer')
                                }}
                                className="inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-medium bg-muted/50 hover:bg-muted rounded text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                                title={urls[index]}
                            >
                                {part}
                            </button>
                        )
                    }
                }
                return <span key={i}>{part}</span>
            })}
        </>
    )
}

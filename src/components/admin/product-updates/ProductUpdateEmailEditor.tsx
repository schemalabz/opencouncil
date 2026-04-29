'use client';

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { SANITIZE_CONFIG } from '@/lib/email/templates/productUpdateDefault';
import {
    Heading1,
    Heading2,
    Heading3,
    Heading4,
    Heading5,
    List,
    ListOrdered,
    Bold,
    Italic,
    Link as LinkIcon,
    Quote,
    Palette,
    Type,
    Component,
    Tag,
    Square,
    MousePointerClick,
    Link2,
    AlignLeft,
    AlignCenter,
    AlignRight,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ProductUpdateEmailEditorHandle {
    /** Returns the current markdown source (with {{...}} placeholders intact). */
    getMarkdown: () => string;
    /**
     * Returns the markdown rendered to sanitized HTML — the exact bytes that
     * will be substituted per recipient and shipped out by the email server.
     */
    getSanitizedHtml: () => string;
}

interface ProductUpdateEmailEditorProps {
    initialContent?: string;
    /** id assigned to the underlying textarea so an external <label htmlFor=...> can target it. */
    textareaId?: string;
}

interface TransformResult {
    /** Range in the original value to replace */
    replaceStart: number;
    replaceEnd: number;
    /** Text inserted in place of that range */
    replacement: string;
    /** Where to position the selection after insertion (absolute, in new value) */
    selectionStart: number;
    selectionEnd: number;
}

type Transform = (value: string, start: number, end: number) => TransformResult;

/** Prefix every line that the selection touches with `prefix`. Cursor lands at the end of the prefixed block. */
function prefixLines(prefix: string): Transform {
    return (value, start, end) => {
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const lineEndIdx = value.indexOf('\n', end);
        const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
        const block = value.slice(lineStart, lineEnd);
        const replacement = block
            .split('\n')
            .map((line) => prefix + line)
            .join('\n');
        const cursor = lineStart + replacement.length;
        return {
            replaceStart: lineStart,
            replaceEnd: lineEnd,
            replacement,
            selectionStart: cursor,
            selectionEnd: cursor,
        };
    };
}

/**
 * Wrap the current selection with `marker` on each side.
 * - With prior selection: cursor lands after the closing marker (no selection),
 *   so accidental typing extends rather than erases the formatted span.
 * - With no prior selection: insert a placeholder and select it, so typing
 *   replaces it with the user's actual content.
 */
function wrapSelection(marker: string, placeholder = 'text'): Transform {
    return (value, start, end) => {
        const hadSelection = start !== end;
        const selected = hadSelection ? value.slice(start, end) : placeholder;
        const replacement = `${marker}${selected}${marker}`;
        if (hadSelection) {
            const cursor = start + replacement.length;
            return {
                replaceStart: start,
                replaceEnd: end,
                replacement,
                selectionStart: cursor,
                selectionEnd: cursor,
            };
        }
        return {
            replaceStart: start,
            replaceEnd: end,
            replacement,
            selectionStart: start + marker.length,
            selectionEnd: start + marker.length + selected.length,
        };
    };
}

/**
 * Wrap the selection in <span style="..."> with the given inline style.
 * Same selection rules as wrapSelection — cursor outside the span when the
 * user already had text selected, placeholder selected otherwise.
 */
function wrapWithSpan(style: string, placeholder = 'text'): Transform {
    return (value, start, end) => {
        const hadSelection = start !== end;
        const selected = hadSelection ? value.slice(start, end) : placeholder;
        const openTag = `<span style="${style}">`;
        const replacement = `${openTag}${selected}</span>`;
        if (hadSelection) {
            const cursor = start + replacement.length;
            return {
                replaceStart: start,
                replaceEnd: end,
                replacement,
                selectionStart: cursor,
                selectionEnd: cursor,
            };
        }
        return {
            replaceStart: start,
            replaceEnd: end,
            replacement,
            selectionStart: start + openTag.length,
            selectionEnd: start + openTag.length + selected.length,
        };
    };
}

/**
 * Wrap the current line(s) with a block-level <div> carrying the given inline style.
 * Used for alignment — text-align is a block property, so a div is required.
 * Cursor lands after the closing tag.
 */
function wrapBlock(style: string): Transform {
    return (value, start, end) => {
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const lineEndIdx = value.indexOf('\n', end);
        const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
        const block = value.slice(lineStart, lineEnd);
        const replacement = `<div style="${style}">${block}</div>`;
        const cursor = lineStart + replacement.length;
        return {
            replaceStart: lineStart,
            replaceEnd: lineEnd,
            replacement,
            selectionStart: cursor,
            selectionEnd: cursor,
        };
    };
}

/** Insert a raw HTML snippet at the cursor (replacing any selection). Cursor lands after the inserted block. */
function insertHtml(html: string): Transform {
    return (_value, start, end) => {
        const cursor = start + html.length;
        return {
            replaceStart: start,
            replaceEnd: end,
            replacement: html,
            selectionStart: cursor,
            selectionEnd: cursor,
        };
    };
}

/** Replace selection with a markdown link, positioning cursor on the URL slot. */
const linkTransform: Transform = (value, start, end) => {
    const selected = value.slice(start, end) || 'link text';
    const replacement = `[${selected}](https://)`;
    const urlStart = start + 1 + selected.length + 2; // `[text](`
    return {
        replaceStart: start,
        replaceEnd: end,
        replacement,
        selectionStart: urlStart,
        selectionEnd: urlStart + 'https://'.length,
    };
};

interface ToolbarButton {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    transform: Transform;
}

const HEADING_BUTTONS: ToolbarButton[] = [
    { icon: Heading1, label: 'Heading 1', transform: prefixLines('# ') },
    { icon: Heading2, label: 'Heading 2', transform: prefixLines('## ') },
    { icon: Heading3, label: 'Heading 3', transform: prefixLines('### ') },
    { icon: Heading4, label: 'Heading 4', transform: prefixLines('#### ') },
    { icon: Heading5, label: 'Heading 5', transform: prefixLines('##### ') },
];

const BLOCK_BUTTONS: ToolbarButton[] = [
    { icon: List, label: 'Bullet list', transform: prefixLines('- ') },
    { icon: ListOrdered, label: 'Numbered list', transform: prefixLines('1. ') },
    { icon: Quote, label: 'Quote', transform: prefixLines('> ') },
];

const INLINE_BUTTONS: ToolbarButton[] = [
    { icon: Bold, label: 'Bold', transform: wrapSelection('**', 'bold') },
    { icon: Italic, label: 'Italic', transform: wrapSelection('*', 'italic') },
    { icon: LinkIcon, label: 'Link', transform: linkTransform },
];

const ALIGN_BUTTONS: ToolbarButton[] = [
    { icon: AlignLeft, label: 'Align left', transform: wrapBlock('text-align:left;') },
    { icon: AlignCenter, label: 'Align center', transform: wrapBlock('text-align:center;') },
    { icon: AlignRight, label: 'Align right', transform: wrapBlock('text-align:right;') },
];

const COLORS: { hex: string; name: string }[] = [
    { hex: '#fc550a', name: 'Brand orange' },
    { hex: '#a4c0e1', name: 'Brand blue' },
    { hex: '#111827', name: 'Heading' },
    { hex: '#374151', name: 'Body' },
    { hex: '#9ca3af', name: 'Muted' },
    { hex: '#10b981', name: 'Success' },
    { hex: '#ef4444', name: 'Destructive' },
];

const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '32px'];

interface ComponentSnippet {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    html: string;
}

/**
 * Pre-styled HTML snippets for common email building blocks. Inline styles
 * only — works across every major email client without further inlining.
 */
const COMPONENTS: ComponentSnippet[] = [
    {
        label: 'Badge',
        icon: Tag,
        html: '<span style="display:inline-block;background-color:#fc550a;color:#ffffff;padding:2px 10px;border-radius:9999px;font-size:12px;font-weight:600;line-height:1.4;">Badge</span>',
    },
    {
        label: 'Box',
        icon: Square,
        html: '<div style="background-color:#f3f4f6;border-left:4px solid #fc550a;padding:16px 20px;border-radius:6px;margin:16px 0;color:#374151;">Your callout content here.</div>',
    },
    {
        label: 'Button',
        icon: MousePointerClick,
        html: '<a href="https://opencouncil.gr" style="display:inline-block;background-color:#fc550a;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;line-height:1.4;">Click me</a>',
    },
    {
        label: 'Link',
        icon: Link2,
        html: '<a href="https://opencouncil.gr" style="color:#2563eb;text-decoration:underline;">link text</a>',
    },
];

const Divider = () => <div className="w-px self-stretch bg-border mx-1" />;

export const ProductUpdateEmailEditor = forwardRef<
    ProductUpdateEmailEditorHandle,
    ProductUpdateEmailEditorProps
>(({ initialContent = '', textareaId }, ref) => {
    const [markdown, setMarkdown] = useState(initialContent);
    const [openPanel, setOpenPanel] = useState<'colors' | 'fontSize' | 'components' | null>(null);
    const [activeTab, setActiveTab] = useState<'compose' | 'preview'>('compose');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const togglePanel = (panel: 'colors' | 'fontSize' | 'components') =>
        setOpenPanel((prev) => (prev === panel ? null : panel));

    /**
     * Sanitized HTML produced from the current markdown. Used both for the
     * live visual preview (via dangerouslySetInnerHTML) and the "Generated
     * HTML" details element so the admin sees exactly what the email body
     * will contain after sanitization.
     */
    const sanitizedHtml = useMemo(() => {
        try {
            const raw = marked.parse(markdown);
            const html = typeof raw === 'string' ? raw : '';
            return DOMPurify.sanitize(html, SANITIZE_CONFIG);
        } catch {
            return '';
        }
    }, [markdown]);

    useImperativeHandle(ref, () => ({
        getMarkdown: () => markdown,
        getSanitizedHtml: () => sanitizedHtml,
    }), [markdown, sanitizedHtml]);

    /**
     * Continue list / quote markers when Enter is pressed inside one of them.
     * Empty marker lines collapse the marker (lets the user exit the list).
     * Uses execCommand so each Enter still goes onto the native undo stack.
     */
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key !== 'Enter' || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;

        const ta = e.currentTarget;
        const { value, selectionStart, selectionEnd } = ta;
        if (selectionStart !== selectionEnd) return; // active selection — let default happen

        const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
        const lineEndIdx = value.indexOf('\n', selectionStart);
        const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
        const currentLine = value.slice(lineStart, lineEnd);

        // Match bullet / numbered / quote prefixes. Captures: indent, marker (or number+'.'), trailing content.
        const match = currentLine.match(/^(\s*)([-*+]|\d+\.|>)\s+(.*)$/);
        if (!match) return;

        const [, indent, marker, content] = match;

        // Cursor must be past the marker for the smart behavior to apply.
        const markerEnd = lineStart + indent.length + marker.length + 1; // +1 for the space
        if (selectionStart < markerEnd) return;

        e.preventDefault();
        ta.focus();

        if (content.length === 0) {
            // Empty marker line → exit the list by clearing the marker.
            ta.setSelectionRange(lineStart, lineEnd);
            document.execCommand('insertText', false, indent);
            return;
        }

        // Continue the list with a fresh marker.
        const nextMarker = /^\d+\.$/.test(marker)
            ? `${parseInt(marker, 10) + 1}.`
            : marker;
        document.execCommand('insertText', false, `\n${indent}${nextMarker} `);
    };

    /**
     * Apply a transform via `document.execCommand('insertText', ...)` so the
     * browser records it on the native undo stack — Ctrl+Z then walks the
     * change back exactly like a manual edit.
     */
    const applyTransform = (transform: Transform) => {
        const ta = textareaRef.current;
        if (!ta) return;
        const result = transform(ta.value, ta.selectionStart, ta.selectionEnd);

        ta.focus();
        ta.setSelectionRange(result.replaceStart, result.replaceEnd);
        // Deprecated but still the only way to programmatically write to a
        // textarea while preserving native undo/redo. Browsers continue to
        // support it indefinitely for this exact reason.
        document.execCommand('insertText', false, result.replacement);
        ta.setSelectionRange(result.selectionStart, result.selectionEnd);
    };

    const renderButton = ({ icon: Icon, label, transform }: ToolbarButton) => (
        <Button
            key={label}
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title={label}
            aria-label={label}
            onClick={() => applyTransform(transform)}
        >
            <Icon className="h-4 w-4" />
        </Button>
    );

    const tabTriggerClass =
        'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[active=true]:bg-background data-[active=true]:text-foreground data-[active=true]:shadow-sm';

    return (
        <div className="space-y-2">
            <div className="flex h-10 w-full items-center justify-start rounded-md bg-muted p-1 text-muted-foreground">
                <button
                    type="button"
                    className={tabTriggerClass}
                    data-active={activeTab === 'compose'}
                    onClick={() => setActiveTab('compose')}
                >
                    Compose
                </button>
                <button
                    type="button"
                    className={tabTriggerClass}
                    data-active={activeTab === 'preview'}
                    onClick={() => setActiveTab('preview')}
                >
                    Preview
                </button>
            </div>

            <div hidden={activeTab !== 'compose'} className="space-y-2">
                <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/30 p-1">
                    {HEADING_BUTTONS.map(renderButton)}
                    <Divider />
                    {BLOCK_BUTTONS.map(renderButton)}
                    <Divider />
                    {INLINE_BUTTONS.map(renderButton)}
                    <Divider />
                    {ALIGN_BUTTONS.map(renderButton)}
                    <Divider />

                    {/* Color picker toggle */}
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn('h-8 w-8 p-0', openPanel === 'colors' && 'bg-accent')}
                        title="Text color"
                        aria-label="Text color"
                        aria-pressed={openPanel === 'colors'}
                        onClick={() => togglePanel('colors')}
                    >
                        <Palette className="h-4 w-4" />
                    </Button>

                    {/* Font size picker toggle */}
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn('h-8 w-8 p-0', openPanel === 'fontSize' && 'bg-accent')}
                        title="Font size"
                        aria-label="Font size"
                        aria-pressed={openPanel === 'fontSize'}
                        onClick={() => togglePanel('fontSize')}
                    >
                        <Type className="h-4 w-4" />
                    </Button>

                    {/* Components picker toggle */}
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn('h-8 w-8 p-0', openPanel === 'components' && 'bg-accent')}
                        title="Insert component"
                        aria-label="Insert component"
                        aria-pressed={openPanel === 'components'}
                        onClick={() => togglePanel('components')}
                    >
                        <Component className="h-4 w-4" />
                    </Button>
                </div>

                {openPanel === 'colors' && (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
                        {COLORS.map((c) => (
                            <button
                                key={c.hex}
                                type="button"
                                title={`${c.name} (${c.hex})`}
                                aria-label={c.name}
                                onClick={() => applyTransform(wrapWithSpan(`color:${c.hex}`))}
                                className="h-6 w-6 rounded-full border border-border hover:scale-110 transition-transform"
                                style={{ backgroundColor: c.hex }}
                            />
                        ))}
                    </div>
                )}

                {openPanel === 'fontSize' && (
                    <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/30 p-2">
                        {FONT_SIZES.map((size) => (
                            <button
                                key={size}
                                type="button"
                                onClick={() => applyTransform(wrapWithSpan(`font-size:${size}`))}
                                className="px-2 py-1 hover:bg-muted rounded border bg-background"
                            >
                                <span style={{ fontSize: size }}>{size}</span>
                            </button>
                        ))}
                    </div>
                )}

                {openPanel === 'components' && (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
                        {COMPONENTS.map(({ label, icon: Icon, html }) => (
                            <button
                                key={label}
                                type="button"
                                onClick={() => applyTransform(insertHtml(html))}
                                className="flex items-center gap-2 px-3 py-2 rounded border bg-background hover:bg-muted text-sm"
                            >
                                <Icon className="h-4 w-4" />
                                {label}
                            </button>
                        ))}
                    </div>
                )}

                <Textarea
                    id={textareaId}
                    ref={textareaRef}
                    value={markdown}
                    onChange={(e) => setMarkdown(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={10}
                    className="font-mono text-sm"
                    placeholder="# Hello&#10;Write your update in markdown…"
                />

                <details className="rounded-md border bg-muted/30 text-sm">
                    <summary className="cursor-pointer select-none px-3 py-2 font-medium">
                        Generated HTML
                    </summary>
                    <pre className="whitespace-pre-wrap break-words border-t bg-background p-3 text-xs leading-relaxed">
                        <code>{sanitizedHtml}</code>
                    </pre>
                </details>
            </div>

            <div hidden={activeTab !== 'preview'}>
                <div
                    className="rounded-md border bg-white p-6 max-w-[600px] mx-auto text-left prose prose-sm
                               prose-headings:font-semibold prose-a:text-primary"
                    dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                />
            </div>
        </div>
    );
});

ProductUpdateEmailEditor.displayName = 'ProductUpdateEmailEditor';

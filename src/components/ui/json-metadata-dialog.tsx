'use client';

import { useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check } from 'lucide-react';

interface JsonView {
    label: string;
    data: unknown;
}

interface BaseProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title?: string;
    metadata?: Array<{
        label: string;
        value: string | number | ReactNode;
        icon?: ReactNode;
    }>;
    badges?: Array<{
        label: string;
        variant?: 'default' | 'secondary' | 'outline' | 'destructive';
        icon?: ReactNode;
    }>;
    footerActions?: ReactNode;
}

interface SingleViewProps extends BaseProps {
    data: unknown;
    views?: never;
}

interface MultiViewProps extends BaseProps {
    data?: never;
    views: JsonView[];
}

type JsonMetadataDialogProps = SingleViewProps | MultiViewProps;

/**
 * Reusable JSON Metadata Dialog Component
 *
 * Displays JSON data in a formatted, scrollable dialog with optional metadata and badges.
 * Includes copy-to-clipboard functionality.
 *
 * Supports two modes:
 * - Single view: pass `data` for a single JSON panel
 * - Multi view: pass `views` for tabbed JSON panels
 *
 * @example
 * ```tsx
 * // Single view
 * <JsonMetadataDialog
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   title="Document Metadata"
 *   data={myJsonObject}
 * />
 *
 * // Multi view with tabs
 * <JsonMetadataDialog
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   title="Task Details"
 *   views={[
 *     { label: 'Request', data: requestData },
 *     { label: 'Response', data: responseData },
 *   ]}
 * />
 * ```
 */
export function JsonMetadataDialog({
    open,
    onOpenChange,
    title = 'Metadata',
    metadata,
    badges,
    footerActions,
    ...rest
}: JsonMetadataDialogProps) {
    const resolvedViews: JsonView[] = rest.views
        ? rest.views
        : [{ label: '', data: rest.data }];

    const [copiedView, setCopiedView] = useState<string | null>(null);

    const handleCopy = async (jsonString: string, viewLabel: string) => {
        try {
            await navigator.clipboard.writeText(jsonString);
            setCopiedView(viewLabel);
            setTimeout(() => setCopiedView(null), 2000);
        } catch (err) {
            console.error('Failed to copy JSON:', err);
        }
    };

    const isMultiView = resolvedViews.length > 1;

    const renderJsonPanel = (view: JsonView) => {
        const jsonString = JSON.stringify(view.data, null, 2);
        return (
            <>
                <ScrollArea className="flex-1 min-h-0">
                    <div className="relative">
                        <Textarea
                            value={jsonString}
                            readOnly
                            className="min-h-[400px] font-mono text-sm resize-none border-0 bg-muted/30"
                            style={{
                                whiteSpace: 'pre',
                                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace'
                            }}
                            aria-label={`${title}${view.label ? ` — ${view.label}` : ''} in JSON format`}
                        />
                    </div>
                </ScrollArea>

                <DialogFooter className="flex justify-between items-center">
                    <div className="text-xs text-muted-foreground">
                        {jsonString.length.toLocaleString()} characters • {jsonString.split('\n').length} lines
                    </div>
                    <div className="flex gap-2">
                        {footerActions}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopy(jsonString, view.label)}
                            className="flex items-center gap-2"
                        >
                            {copiedView === view.label ? (
                                <>
                                    <Check className="h-4 w-4" />
                                    Copied!
                                </>
                            ) : (
                                <>
                                    <Copy className="h-4 w-4" />
                                    Copy JSON
                                </>
                            )}
                        </Button>
                        {!isMultiView && (
                            <Button variant="default" onClick={() => onOpenChange(false)}>
                                Close
                            </Button>
                        )}
                    </div>
                </DialogFooter>
            </>
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>

                {/* Optional Metadata Section */}
                {metadata && metadata.length > 0 && (
                    <div className="flex flex-wrap gap-3 py-2">
                        {metadata.map((item, index) => (
                            <div key={index} className="text-sm flex items-center gap-1">
                                {item.icon}
                                <span className="font-medium">{item.label}:</span>
                                <span>{item.value}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Optional Badges Section */}
                {badges && badges.length > 0 && (
                    <div className="flex flex-wrap gap-2 py-2">
                        {badges.map((badge, index) => (
                            <Badge key={index} variant={badge.variant || 'secondary'} className="flex items-center gap-1">
                                {badge.icon}
                                {badge.label}
                            </Badge>
                        ))}
                    </div>
                )}

                {/* JSON Content */}
                {isMultiView ? (
                    <Tabs local defaultValue={resolvedViews[resolvedViews.length - 1].label} className="flex-1 flex flex-col min-h-0">
                        <TabsList>
                            {resolvedViews.map(view => (
                                <TabsTrigger key={view.label} value={view.label}>
                                    {view.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                        {resolvedViews.map(view => (
                            <TabsContent key={view.label} value={view.label} className="flex-1 flex flex-col min-h-0 mt-0">
                                {renderJsonPanel(view)}
                            </TabsContent>
                        ))}
                    </Tabs>
                ) : (
                    renderJsonPanel(resolvedViews[0])
                )}
            </DialogContent>
        </Dialog>
    );
}

'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Copy, Check } from 'lucide-react';

interface JsonMetadataDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title?: string;
    data: any;
    metadata?: Array<{
        label: string;
        value: string | number | React.ReactNode;
        icon?: React.ReactNode;
    }>;
    badges?: Array<{
        label: string;
        variant?: 'default' | 'secondary' | 'outline' | 'destructive';
        icon?: React.ReactNode;
    }>;
}

/**
 * Reusable JSON Metadata Dialog Component
 * 
 * Displays JSON data in a formatted, scrollable dialog with optional metadata and badges.
 * Includes copy-to-clipboard functionality.
 * 
 * @example
 * ```tsx
 * <JsonMetadataDialog
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   title="Document Metadata"
 *   data={myJsonObject}
 *   metadata={[
 *     { label: 'Subject', value: 'Example' },
 *     { label: 'City', value: 'Athens' }
 *   ]}
 *   badges={[
 *     { label: 'Active', variant: 'default' },
 *     { label: '5 items', variant: 'secondary' }
 *   ]}
 * />
 * ```
 */
export function JsonMetadataDialog({
    open,
    onOpenChange,
    title = 'Metadata',
    data,
    metadata,
    badges
}: JsonMetadataDialogProps) {
    const [copied, setCopied] = useState(false);

    const jsonString = JSON.stringify(data, null, 2);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(jsonString);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy JSON:', err);
        }
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
                            aria-label={`${title} in JSON format`}
                        />
                    </div>
                </ScrollArea>

                <DialogFooter className="flex justify-between items-center">
                    <div className="text-xs text-muted-foreground">
                        {jsonString.length.toLocaleString()} characters • {jsonString.split('\n').length} lines
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCopy}
                            className="flex items-center gap-2"
                        >
                            {copied ? (
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
                        <Button variant="default" onClick={() => onOpenChange(false)}>
                            Close
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


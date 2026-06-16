// src/app/[locale]/(other)/docs/design-system/ComponentShowcase.tsx
'use client';

import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ComponentShowcaseProps {
    name: string;
    sourcePath: string;
    prompt: string;
    children: ReactNode;
}

export function ComponentShowcase({ name, sourcePath, prompt, children }: ComponentShowcaseProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        const text = `${prompt}\n\nFollow OpenCouncil's design rules: ${window.location.origin}/api/design-context/combined`;
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy prompt:', err);
        }
    };

    return (
        <div className="rounded-md border p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold">{name}</h3>
                    <code className="text-xs text-muted-foreground">{sourcePath}</code>
                </div>
                <Button variant="ghost" size="sm" onClick={handleCopy} title="Copy LLM prompt">
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    <span className="ml-1">Copy prompt</span>
                </Button>
            </div>
            <div className="rounded-md bg-muted/30 p-4">{children}</div>
        </div>
    );
}

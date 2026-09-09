// src/app/[locale]/(other)/docs/design-system/DesignWithLLM.tsx
'use client';

import { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DesignContextDoc } from '@/lib/design-system/llm-context';

type Contexts = Record<DesignContextDoc, string>;

const COPY_ITEMS: { doc: DesignContextDoc; label: string }[] = [
    { doc: 'design', label: 'Copy styles (DESIGN.md)' },
    { doc: 'product', label: 'Copy product (PRODUCT.md)' },
    { doc: 'combined', label: 'Copy combined preamble' },
    { doc: 'skill', label: 'Copy design skill (SKILL.md)' },
];

export function DesignWithLLM({ contexts }: { contexts: Contexts }) {
    const [done, setDone] = useState<string | null>(null);

    const copy = async (key: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setDone(key);
            setTimeout(() => setDone((d) => (d === key ? null : d)), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const copyPointer = () => {
        const url = `${window.location.origin}/api/design-context/combined`;
        copy('pointer', `When designing for OpenCouncil, read and follow ${url} (its design + product rules).`);
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                    <Sparkles className="h-4 w-4 mr-1" /> Design with LLM
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Copy full context</DropdownMenuLabel>
                {COPY_ITEMS.map((item) => (
                    <DropdownMenuItem key={item.doc} onClick={() => copy(item.doc, contexts[item.doc])}>
                        {done === item.doc ? <Check className="h-4 w-4 mr-2 text-green-600" /> : null}
                        {item.label}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Reference</DropdownMenuLabel>
                <DropdownMenuItem onClick={copyPointer}>
                    {done === 'pointer' ? <Check className="h-4 w-4 mr-2 text-green-600" /> : null}
                    Copy canonical link (pointer prompt)
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

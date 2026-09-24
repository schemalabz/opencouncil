// ComponentDoc.tsx
'use client';

import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ComponentDocProps {
    name: string;
    sourcePath: string;
    description: string;
    dos: string[];
    donts: string[];
    code?: string;
    imports?: string;
    children: ReactNode;
}

export function ComponentDoc({ name, sourcePath, description, dos, donts, code, imports, children }: ComponentDocProps) {
    const codeBlock = [imports, code].filter(Boolean).join('\n\n');
    const [copied, setCopied] = useState(false);
    const [codeCopied, setCodeCopied] = useState(false);

    const copyText = async (text: string, setFlag: (v: boolean) => void) => {
        try {
            await navigator.clipboard.writeText(text);
            setFlag(true);
            setTimeout(() => setFlag(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const handleCopy = () => {
        const origin = window.location.origin;
        const prompt = [
            `Use the OpenCouncil "${name}" component (source: ${sourcePath}).`,
            description,
            '',
            "Do's:",
            ...dos.map((d) => `- ${d}`),
            "Don'ts:",
            ...donts.map((d) => `- ${d}`),
            '',
            `Follow OpenCouncil's full design + product rules: ${origin}/api/design-context/combined`,
        ].join('\n');
        copyText(prompt, setCopied);
    };

    return (
        <article className="space-y-8">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold !text-left">{name}</h2>
                    <p className="text-muted-foreground mt-1">{description}</p>
                    <code className="text-xs text-muted-foreground">{sourcePath}</code>
                </div>
                <Button variant="secondary" size="sm" onClick={handleCopy}>
                    {copied ? <Check className="h-4 w-4 mr-1 text-green-600" /> : <Copy className="h-4 w-4 mr-1" />}
                    Copy Prompt
                </Button>
            </div>

            <section>
                <h3 className="text-sm font-semibold mb-2">Preview</h3>
                <div className="rounded-md border bg-white p-6">{children}</div>
            </section>

            {code && (
                <section>
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold">Code</h3>
                        <Button variant="ghost" size="sm" onClick={() => copyText(codeBlock, setCodeCopied)}>
                            {codeCopied ? <Check className="h-4 w-4 mr-1 text-green-600" /> : <Copy className="h-4 w-4 mr-1" />}
                            Copy code
                        </Button>
                    </div>
                    <pre className="rounded-md border bg-muted/40 p-4 overflow-x-auto text-sm"><code>{codeBlock}</code></pre>
                </section>
            )}

            <section className="grid gap-6 sm:grid-cols-2">
                <div>
                    <h3 className="text-sm font-semibold mb-2 text-green-700">Do</h3>
                    <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-4">
                        {dos.map((d) => <li key={d}>{d}</li>)}
                    </ul>
                </div>
                <div>
                    <h3 className="text-sm font-semibold mb-2 text-red-700">Don't</h3>
                    <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-4">
                        {donts.map((d) => <li key={d}>{d}</li>)}
                    </ul>
                </div>
            </section>
        </article>
    );
}

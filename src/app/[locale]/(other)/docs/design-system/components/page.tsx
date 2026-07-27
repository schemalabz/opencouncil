// components/page.tsx
import { ArrowUpRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { getEntries } from '../_registry';

const NO_PREVIEW = new Set(['dialog', 'tooltip']);

export default function ComponentsIndex() {
    const entries = getEntries('components');
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold">Components</h2>
            <div className="grid gap-3 sm:grid-cols-2">
                {entries.map((e) => (
                    <Card key={e.slug} className="h-full transition-all hover:shadow-md hover:border-foreground/20">
                        <CardHeader>
                            <Link
                                href={`/docs/design-system/components/${e.slug}`}
                                className="group flex items-center justify-between gap-2 no-underline hover:no-underline"
                            >
                                <CardTitle className="text-base group-hover:text-foreground">{e.name}</CardTitle>
                                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                            </Link>
                            <CardDescription>{e.description}</CardDescription>
                        </CardHeader>
                        {!NO_PREVIEW.has(e.slug) && (
                            <CardContent className="pt-0">
                                <Separator className="mb-4" />
                                <div className="pointer-events-none select-none overflow-hidden">{e.previewSample ?? e.sample}</div>
                            </CardContent>
                        )}
                    </Card>
                ))}
            </div>
        </div>
    );
}

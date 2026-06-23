'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { HelpCircle } from 'lucide-react';
import Link from 'next/link';

export function MapExplainer() {
    const t = useTranslations('map.explainer');
    const [open, setOpen] = useState(false);

    const strong = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <Button
                onClick={() => setOpen(true)}
                size="lg"
                className="fixed bottom-6 left-[110px] sm:left-[160px] z-40 rounded-full shadow-lg h-14 px-6 gap-2 bg-white hover:bg-gray-50 text-foreground border border-border"
            >
                <HelpCircle className="h-5 w-5" />
                <span className="hidden sm:inline">{t('button')}</span>
            </Button>

            <SheetContent side="left" className="w-full sm:max-w-lg overflow-y-auto">
                <SheetHeader className="text-left mb-6">
                    <SheetTitle className="text-2xl">{t('title')}</SheetTitle>
                </SheetHeader>

                <div className="space-y-4 text-sm leading-relaxed">
                    <p>{t.rich('p1', { strong })}</p>

                    <p>{t.rich('p2', { strong })}</p>

                    <p>{t.rich('p3', { strong })}</p>

                    <p>{t.rich('p4', { strong })}</p>

                    <div className="pt-4 border-t border-border">
                        <p className="mb-3">{t.rich('p5', { strong })}</p>
                        <p>
                            {t('p6Prefix')}
                            <Link
                                href="/about"
                                className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                                onClick={() => setOpen(false)}
                            >
                                {t('p6LinkText')}
                            </Link>
                            {t('p6Suffix')}
                        </p>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}

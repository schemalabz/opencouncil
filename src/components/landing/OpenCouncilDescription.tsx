'use client';

import { Bot, Eye, Building2, Lightbulb } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface OpenCouncilDescriptionProps {
    className?: string;
    animate?: boolean;
}

export function OpenCouncilDescription({ className = "", animate = false }: OpenCouncilDescriptionProps) {
    const t = useTranslations('Landing');
    return (
        <p className={`text-sm sm:text-lg md:text-xl lg:text-2xl text-muted-foreground mx-auto leading-relaxed ${className}`}>
            {t('descriptionPrefix')}{' '}
            <em className="not-italic inline-flex items-center gap-1.5 px-1.5 py-0.5 sm:px-2 sm:py-1 text-foreground">
                <Bot className="w-4 h-4 sm:w-5 sm:h-5" />
                {t('descriptionAI')}
            </em>{' '}
            {t('descriptionTo')}{' '}
            <em className="not-italic inline-flex items-center gap-1.5 px-2 py-1 text-foreground">
                <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                {t('descriptionMonitor')}
            </em>{' '}
            {t('descriptionThe')}{' '}
            <em className="not-italic inline-flex items-center gap-1.5 px-2 py-1 text-foreground">
                <Building2 className="w-4 h-4 sm:w-5 sm:h-5" />
                {t('descriptionCouncils')}
            </em>{' '}
            {t('descriptionAndMake')}{' '}
            <em className="not-italic inline-flex items-center gap-1.5 px-2 py-1 text-foreground">
                <Lightbulb className="w-4 h-4 sm:w-5 sm:h-5" />
                {t('descriptionSimple')}
            </em>
        </p>
    );
} 
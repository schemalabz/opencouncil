import { Landmark } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AdministrativeBody } from '@prisma/client';
import { getLocalizedName } from '@/lib/formatters/name';
import { cn } from '@/lib/utils';

interface AdminBodyLabelProps {
    body: AdministrativeBody | null | undefined;
    locale: string;
    className?: string;
}

/**
 * Which body a meeting belongs to — the council, a committee, a κοινότητα.
 *
 * It reads as secondary detail but it is not optional: the same municipality's
 * council and its committees decide different things, and a date alone does not
 * say which one you are looking at.
 *
 * `CouncilMeeting.administrativeBodyId` is nullable (cities imported before
 * administrative bodies existed have nulls), so this renders a placeholder
 * rather than nothing. Callers should mount it unconditionally — a row that
 * sometimes disappears is what this component exists to prevent.
 *
 * Hook-free apart from `useTranslations`, so it renders on the server and inside
 * client trees alike.
 */
export function AdminBodyLabel({ body, locale, className }: AdminBodyLabelProps) {
    const t = useTranslations('cityOverview');

    return (
        <span className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
            <Landmark className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
                {body ? getLocalizedName(body, locale) : t('adminBodyUnknown')}
            </span>
        </span>
    );
}

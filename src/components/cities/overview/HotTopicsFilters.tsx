"use client";
import { CalendarRange, Check, ChevronDown, Landmark } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/routing';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HOT_PERIODS, HOT_SCOPES, type HotPeriod, type HotScope } from '@/lib/utils/hotTopicFilters';
import { cn } from '@/lib/utils';

interface HotTopicsFiltersProps {
    scope: HotScope;
    period: HotPeriod;
    /** Body types the city actually has, so the picker offers no empty scope. */
    availableScopes: HotScope[];
}

/**
 * The ranking's two dials: which body, and how far back.
 *
 * Deliberately quiet — an icon and the current value, at the size of a caption.
 * The ranking is the page's lead content and these only re-scope it, so they sit
 * beside the heading rather than above the list as a filter bar.
 *
 * The choice rides in the URL: the ranking is computed and cached server-side
 * per scope and period, so a shareable link is also the only way to reach a
 * variant without shipping every one of them to the browser.
 */
export function HotTopicsFilters({ scope, period, availableScopes }: HotTopicsFiltersProps) {
    const t = useTranslations('cityOverview');
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const choose = (key: 'scope' | 'period', value: string, isDefault: boolean) => {
        const params = new URLSearchParams(searchParams.toString());
        if (isDefault) {
            params.delete(key);
        } else {
            params.set(key, value);
        }
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    };

    return (
        <div className="flex shrink-0 flex-wrap items-center gap-1">
            <Picker
                icon={<Landmark className="h-3.5 w-3.5" aria-hidden />}
                label={t(HOT_SCOPES[scope].label)}
                options={availableScopes.map(value => ({
                    value,
                    // Abbreviated on the closed picker, named in the open menu:
                    // the trigger sits beside a heading and has room for two
                    // letters, the menu has room to say what they stand for.
                    label: t(HOT_SCOPES[value].fullLabel),
                    selected: value === scope,
                    onSelect: () => choose('scope', value, HOT_SCOPES[value].isDefault),
                }))}
            />
            <Picker
                icon={<CalendarRange className="h-3.5 w-3.5" aria-hidden />}
                label={t(HOT_PERIODS[period].label)}
                options={(Object.keys(HOT_PERIODS) as HotPeriod[]).map(value => ({
                    value,
                    label: t(HOT_PERIODS[value].label),
                    selected: value === period,
                    onSelect: () => choose('period', value, HOT_PERIODS[value].isDefault),
                }))}
            />
        </div>
    );
}

interface PickerOption {
    value: string;
    label: string;
    selected: boolean;
    onSelect: () => void;
}

function Picker({ icon, label, options }: { icon: React.ReactNode; label: string; options: PickerOption[] }) {
    if (options.length < 2) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger className="flex h-7 items-center gap-1.5 rounded-full px-2 text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30">
                {icon}
                {label}
                <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[10rem]">
                {options.map(option => (
                    <DropdownMenuItem
                        key={option.value}
                        onClick={option.onSelect}
                        className={cn('cursor-pointer gap-2 text-xs', option.selected && 'font-semibold')}
                    >
                        <Check className={cn('h-3.5 w-3.5', option.selected ? 'opacity-100' : 'opacity-0')} aria-hidden />
                        {option.label}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

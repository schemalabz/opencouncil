"use client";

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { CONVENTION_FIELDS, CONVENTION_FLAGS, normalizeAnchors, type DecisionConventions } from '@/lib/decisionConventions';

/**
 * The rules the derivation read this meeting's documents by.
 *
 * `rules` is null when nobody has profiled the body: the section still renders,
 * because "there are no rules" is itself something to know about a meeting
 * whose facts were derived on defaults.
 */
export interface ConventionsPanel {
    rules: DecisionConventions | null;
    bodyName: string;
    cityName: string;
    /** Where the rules are edited. Nothing addresses a body on its own — the
     * fields live inside the city form — so this is the city's page. */
    editHref: string;
}

/** The fields that hold a value, in the order the admin form lists them. */
const FIELDS = Object.keys(CONVENTION_FIELDS) as (keyof typeof CONVENTION_FIELDS)[];

const boxClass = 'rounded-lg border bg-background p-2.5';
const titleClass = 'text-[11px] font-extrabold tracking-[.04em] text-muted-foreground';

/**
 * A value with its explanation one click away — dotted underline as the
 * affordance, the explanation as text rather than a `title=` tooltip, which is
 * invisible on touch and uncopyable everywhere. A value with nothing further to
 * say renders as plain text, so every underline in the list is a real offer.
 */
function Disclosure({ label, description }: { label: string; description: ReactNode | null }) {
    const [open, setOpen] = useState(false);
    if (!description) return <span className="text-xs">{label}</span>;
    return (
        <>
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen(value => !value)}
                className="text-left text-xs underline decoration-dotted decoration-muted-foreground/70 underline-offset-2 hover:decoration-foreground"
            >
                {label}
            </button>
            {open && <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>}
        </>
    );
}

/**
 * How this body's decision documents read, as the derivation was told to read
 * them — collapsed to the four shaped values, expanded to all eight fields.
 *
 * Every label and description here is the admin form's own copy: one glossary
 * for the person who sets the rules and the person who audits a meeting against
 * them, so the two never drift into describing the same field differently.
 *
 * The body is named under the heading because the rules belong to the body
 * while this page is one meeting of it; without the line they read as this
 * meeting's. There is no confirm control: confirming means someone checked all
 * eight fields, which a summary cannot stand in for.
 */
export function ConventionsSection({ panel }: { panel: ConventionsPanel }) {
    const t = useTranslations('admin.conventions');
    const tRail = useTranslations('admin.decisionsPage.rail');
    const [open, setOpen] = useState(false);

    // Every key in the glossary is assembled from the field, sometimes one of
    // its values, and the part wanted: `namedVoters.fieldLabel`,
    // `namedVoters.all.description`, `usesSubstitutes.label`. The admin form
    // reads the same three shapes.
    const text = (...key: string[]) => t(key.join('.'));

    const { rules, bodyName, cityName, editHref } = panel;
    const anchors = rules ? normalizeAnchors(rules.attendanceChangeAnchors ?? []) : [];

    const heading = (
        <>
            <span className={cn('block', titleClass)}>{tRail('conventionsTitle')}</span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">{`${bodyName} · ${cityName}`}</span>
        </>
    );

    const editLink = (
        <Link href={editHref} className="mt-2 inline-block text-[11px] text-muted-foreground hover:text-foreground hover:underline">
            {`${tRail('conventionsEdit')} →`}
        </Link>
    );

    if (!rules) {
        return (
            <div className={boxClass}>
                {heading}
                <p className="mt-1 text-xs text-muted-foreground">{tRail('conventionsNone')}</p>
                {editLink}
            </div>
        );
    }

    // What a field holds, as a list: the anchors are a set (and can be empty),
    // every other field is one value.
    const valuesOf = (field: keyof typeof CONVENTION_FIELDS): string[] => {
        const stored = rules[field];
        return Array.isArray(stored) ? anchors : [stored];
    };

    const valueLabel = (field: keyof typeof CONVENTION_FIELDS): string => {
        const values = valuesOf(field);
        return values.length > 0 ? values.map(value => text(field, value, 'label')).join(', ') : t('anchors.none');
    };

    const valueDescription = (field: keyof typeof CONVENTION_FIELDS): ReactNode | null => {
        const values = valuesOf(field);
        return values.length > 0 ? values.map(value => text(field, value, 'description')).join(' · ') : null;
    };

    // A body that states no arrivals or departures has nothing to summarise for
    // that field; the sentence saying so belongs in the expanded list, not on a
    // line read at a glance.
    const summary = FIELDS.filter(field => valuesOf(field).length > 0).map(valueLabel).join(' · ');

    return (
        <div className={boxClass}>
            <Collapsible open={open} onOpenChange={setOpen}>
                <CollapsibleTrigger className="flex w-full items-start gap-2 text-left">
                    <span className="min-w-0 flex-1">
                        {heading}
                        {!open && <span className="mt-1 block text-xs">{summary}</span>}
                    </span>
                    <ChevronDown
                        className={cn('mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
                        aria-hidden
                    />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2 border-t pt-2">
                    {FIELDS.map(field => (
                        <div key={field}>
                            <div className="text-[11px] text-muted-foreground">{text(field, 'fieldLabel')}</div>
                            <Disclosure label={valueLabel(field)} description={valueDescription(field)} />
                        </div>
                    ))}
                    <div className="space-y-1 pt-0.5">
                        {CONVENTION_FLAGS.map(flag => (
                            <div key={flag} className="flex items-baseline gap-1.5">
                                <span className={cn('text-xs', rules[flag] ? 'text-foreground' : 'text-muted-foreground')}>
                                    {rules[flag] ? '✓' : '✗'}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <Disclosure label={text(flag, 'label')} description={text(flag, 'description')} />
                                </span>
                            </div>
                        ))}
                    </div>
                    {editLink}
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
}

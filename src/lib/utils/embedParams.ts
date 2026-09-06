import { AdministrativeBodyType } from '@prisma/client';
import { DEFAULT_LOCALE, urlPrefixForLocale } from '@/i18n/config';
import {
    generateThemeVars,
    generateAppThemeShim,
    parseAccentColor,
    type EmbedMode,
    type EmbedRadius,
    type EmbedThemeVars,
    type AppThemeShim,
} from '@/lib/utils/embedTheme';

const VALID_BODY_TYPES = new Set<string>(['council', 'committee', 'community']);

export interface BoundedIntSpec {
    default: number;
    min: number;
    max: number;
}

/** Cards shown by the meetings and subjects widgets. */
const DEFAULT_LIMIT: BoundedIntSpec = { default: 5, min: 1, max: 10 };

/** Bounds of the meeting summary widget's own params; the configurator reads the same values. */
export const EMBED_SUMMARY_LIMITS = {
    /** Latest past meetings shown when no `meetingId` is given. */
    meetings: { default: 1, min: 1, max: 5 },
    /** Subject cards per meeting. */
    subjects: { default: 6, min: 1, max: 20 },
} as const satisfies Record<string, BoundedIntSpec>;

/** A query integer clamped to `[min, max]`; missing, invalid or zero falls back to the default. */
export function parseBoundedInt(raw: string | undefined, { default: fallback, min, max }: BoundedIntSpec): number {
    const parsed = parseInt(raw || '', 10) || fallback;
    return Math.min(Math.max(parsed, min), max);
}

/**
 * URL prefix for a locale under next-intl's `as-needed` prefixing: empty for
 * the default locale, so a Greek iframe links to unprefixed Greek pages and an
 * English one to `/en/...`.
 */
export function embedLocalePrefix(locale: string): string {
    return locale === DEFAULT_LOCALE ? '' : `/${urlPrefixForLocale(locale)}`;
}

/** Raw query params shared by every embed widget variant. */
export interface EmbedSearchParams {
    accent?: string;
    mode?: string;
    limit?: string;
    radius?: string;
    /** Comma-separated admin-body types (council/committee/community). */
    bodies?: string;
    /** Comma-separated specific admin-body ids; takes precedence over `bodies`. */
    bodyIds?: string;
}

export interface ParsedEmbedConfig {
    mode: EmbedMode;
    radius: EmbedRadius;
    /** Number of cards to show, clamped to the widget's bounds (1–10 unless overridden). */
    limit: number;
    administrativeBodyTypes?: AdministrativeBodyType[];
    administrativeBodyIds?: string[];
    themeVars: EmbedThemeVars;
    /** App design-token overrides for the shared SubjectCardContent in the subjects widget. */
    appThemeShim: AppThemeShim;
}

/**
 * Parse the appearance/filter query params common to all embed widgets
 * (`/embed/meetings`, `/embed/subjects`, …) and derive the theme vars.
 * Variant-specific params (e.g. `showSubjects`) stay in their own routes. The
 * base URL for links is realm-dependent, see `embedBaseUrl`.
 */
export function parseEmbedConfig(searchParams: EmbedSearchParams, options: { limit?: BoundedIntSpec } = {}): ParsedEmbedConfig {
    const accent = parseAccentColor(searchParams.accent);
    const mode: EmbedMode = searchParams.mode === 'dark' ? 'dark' : 'light';
    const limit = parseBoundedInt(searchParams.limit, options.limit ?? DEFAULT_LIMIT);
    const radius: EmbedRadius =
        searchParams.radius === 'sharp' || searchParams.radius === 'pill'
            ? searchParams.radius
            : 'rounded';
    const bodyTypeFilter = (searchParams.bodies?.split(',').filter(Boolean) || [])
        .filter((v): v is AdministrativeBodyType => VALID_BODY_TYPES.has(v));
    const administrativeBodyTypes = bodyTypeFilter.length > 0 ? bodyTypeFilter : undefined;

    const bodyIdFilter = (searchParams.bodyIds?.split(',').map(s => s.trim()).filter(Boolean)) || [];
    const administrativeBodyIds = bodyIdFilter.length > 0 ? bodyIdFilter : undefined;

    return {
        mode,
        radius,
        limit,
        administrativeBodyTypes,
        administrativeBodyIds,
        themeVars: generateThemeVars(accent, mode, radius),
        appThemeShim: generateAppThemeShim(accent, mode, radius),
    };
}

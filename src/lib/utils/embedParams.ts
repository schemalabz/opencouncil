import { AdministrativeBodyType } from '@prisma/client';
import { env } from '@/env.mjs';
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
    /** Clamped to 1–10 — number of cards to show. */
    limit: number;
    administrativeBodyTypes?: AdministrativeBodyType[];
    administrativeBodyIds?: string[];
    themeVars: EmbedThemeVars;
    /** App design-token overrides for the shared SubjectCardContent in the subjects widget. */
    appThemeShim: AppThemeShim;
    /** Trailing-slash-free base URL for building card links. */
    baseUrl: string;
}

/**
 * Parse the appearance/filter query params common to all embed widgets
 * (`/embed/meetings`, `/embed/subjects`, …) and derive the theme vars + base
 * URL. Variant-specific params (e.g. `showSubjects`) stay in their own routes.
 */
export function parseEmbedConfig(searchParams: EmbedSearchParams): ParsedEmbedConfig {
    const accent = parseAccentColor(searchParams.accent);
    const mode: EmbedMode = searchParams.mode === 'dark' ? 'dark' : 'light';
    const limit = Math.min(Math.max(parseInt(searchParams.limit || '5', 10) || 5, 1), 10);
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
        baseUrl: env.NEXTAUTH_URL.replace(/\/$/, ''),
    };
}

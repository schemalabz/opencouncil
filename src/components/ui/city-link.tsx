"use client";

import { ReactNode } from "react";
import { Link as NextIntlLink } from '@/i18n/routing';
import { buildCityUrl } from "@/lib/utils";
import { useLocale } from "next-intl";

interface CityLinkProps {
    cityId: string;
    path?: string;
    children: ReactNode;
    className?: string;
    preserveLocale?: boolean;
}

/**
 * A component that generates the appropriate link for a city
 * Handles both subdomain-based and path-based navigation
 */
export function CityLink({
    cityId,
    path = '',
    children,
    className = '',
    preserveLocale = true
}: CityLinkProps) {
    const locale = useLocale();
    const url = buildCityUrl(cityId, path, preserveLocale ? locale : undefined);

    // If the URL is absolute (starts with http), use a regular anchor tag
    if (url.startsWith('http')) {
        return (
            <a href={url} className={className}>
                {children}
            </a>
        );
    }

    // Otherwise use the Next.js Link component
    return (
        <NextIntlLink href={url} className={className}>
            {children}
        </NextIntlLink>
    );
} 
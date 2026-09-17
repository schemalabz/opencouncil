/**
 * Tabs build their hrefs from the current path. That path must carry no locale
 * prefix: the `Link` of `@/i18n/routing` adds the prefix itself. The component
 * read the path from `next/navigation` before, which keeps the prefix, so a tab
 * on /lat pointed at /lat/lat/… and returned 404.
 *
 * next-intl is ESM, and jest cannot load it. This suite therefore doubles the
 * two helpers that the component takes from `@/i18n/routing`. Both doubles use
 * the real prefix rules of `@/i18n/config`: the double of `usePathname` removes
 * one prefix, and the double of `Link` adds one back.
 */
import { render, screen } from '@testing-library/react';

const mockState = { pathname: '/nis/parties/p1', search: '', locale: 'el' };

jest.mock('next/navigation', () => ({
    usePathname: () => mockState.pathname,
    useSearchParams: () => new URLSearchParams(mockState.search),
}));

jest.mock('@/i18n/routing', () => {
    const React = require('react');
    const { localePathPrefix, stripLocalePrefix } = require('@/i18n/config');

    return {
        usePathname: () => stripLocalePrefix(mockState.pathname),
        // next-intl's `Link` drops `scroll` and `shallow` rather than passing
        // them to the anchor.
        Link: React.forwardRef(function LinkDouble(
            { href, scroll, shallow, ...rest }: { href: string; scroll?: boolean; shallow?: boolean },
            ref: React.Ref<HTMLAnchorElement>,
        ) {
            return <a ref={ref} href={`${localePathPrefix(mockState.locale)}${href}`} {...rest} />;
        }),
    };
});

import { Tabs, TabsList, TabsTrigger } from '../tabs';

function renderTabs() {
    render(
        <Tabs defaultValue="people">
            <TabsList>
                <TabsTrigger value="people">People</TabsTrigger>
                <TabsTrigger value="contributions">Contributions</TabsTrigger>
            </TabsList>
        </Tabs>,
    );
}

const hrefOf = (name: string) => screen.getByRole('link', { name }).getAttribute('href');

describe('Tabs hrefs', () => {
    test('keeps one locale prefix on a prefixed locale', () => {
        Object.assign(mockState, { pathname: '/lat/nis/parties/p1', search: 'tab=contributions', locale: 'sr-Latn' });

        renderTabs();

        expect(hrefOf('People')).toBe('/lat/nis/parties/p1');
        expect(hrefOf('Contributions')).toBe('/lat/nis/parties/p1?tab=contributions');
    });

    test('adds no prefix on the default locale', () => {
        Object.assign(mockState, { pathname: '/chania/parties/p1', search: '', locale: 'el' });

        renderTabs();

        expect(hrefOf('People')).toBe('/chania/parties/p1');
        expect(hrefOf('Contributions')).toBe('/chania/parties/p1?tab=contributions');
    });

    test('keeps the other search params of the page', () => {
        Object.assign(mockState, { pathname: '/lat/nis/parties/p1', search: 'type=council', locale: 'sr-Latn' });

        renderTabs();

        expect(hrefOf('Contributions')).toBe('/lat/nis/parties/p1?type=council&tab=contributions');
    });
});

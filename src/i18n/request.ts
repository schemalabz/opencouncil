import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
    // This typically corresponds to the `[locale]` segment
    let locale = await requestLocale;

    // Ensure that the incoming locale is valid
    if (!locale || !routing.locales.includes(locale as any)) {
        locale = routing.defaultLocale;
    }

    // By calling `import()` directly for each namespace with a template literal,
    // we provide enough information for Webpack to correctly bundle the JSON files.
    // The `.catch(() => ({}))` ensures that if a translation file for a specific
    // namespace doesn't exist, the app won't crash.
    const [
        admin, chat, cities, common, forms, landing, meetings,
        pages, parties, people, profile, statistics, user
    ] = await Promise.all([
        import(`../../messages/${locale}/admin.json`).then(m => m.default).catch(() => ({})),
        import(`../../messages/${locale}/chat.json`).then(m => m.default).catch(() => ({})),
        import(`../../messages/${locale}/cities.json`).then(m => m.default).catch(() => ({})),
        import(`../../messages/${locale}/common.json`).then(m => m.default).catch(() => ({})),
        import(`../../messages/${locale}/forms.json`).then(m => m.default).catch(() => ({})),
        import(`../../messages/${locale}/landing.json`).then(m => m.default).catch(() => ({})),
        import(`../../messages/${locale}/meetings.json`).then(m => m.default).catch(() => ({})),
        import(`../../messages/${locale}/pages.json`).then(m => m.default).catch(() => ({})),
        import(`../../messages/${locale}/parties.json`).then(m => m.default).catch(() => ({})),
        import(`../../messages/${locale}/people.json`).then(m => m.default).catch(() => ({})),
        import(`../../messages/${locale}/profile.json`).then(m => m.default).catch(() => ({})),
        import(`../../messages/${locale}/statistics.json`).then(m => m.default).catch(() => ({})),
        import(`../../messages/${locale}/user.json`).then(m => m.default).catch(() => ({})),
    ]);

    return {
        locale,
        messages: {
            ...admin, ...chat, ...cities, ...common, ...forms, ...landing,
            ...meetings, ...pages, ...parties, ...people, ...profile,
            ...statistics, ...user
        },
    };
});
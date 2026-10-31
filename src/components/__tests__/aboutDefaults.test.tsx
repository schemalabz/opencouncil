/** @jest-environment node */
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import type { Realm } from '@prisma/client';
import Hero from '../about/Hero';
import PilotSection from '../about/PilotSection';
import { demoScenarioForRealm, shotsForRealm } from '../about/config';
import en from '../../../messages/en/about.json';
import el from '../../../messages/el/about.json';
import fr from '../../../messages/fr/about.json';
import sr from '../../../messages/sr/about.json';

function renderPilotCopy(realm: Realm, locale: string, messages: typeof en) {
    return renderToStaticMarkup(
        <NextIntlClientProvider locale={locale} timeZone="UTC" messages={{ about: messages }}>
            <Hero realm={realm} stage="pending" shots={shotsForRealm(realm)} onContactClick={() => {}} />
            <PilotSection realm={realm} onContactClick={() => {}} />
        </NextIntlClientProvider>,
    );
}

it.each([
    ['en', en, 'We are looking for our first pilot municipality', 'Become our first pilot municipality.'],
    ['el', el, 'Αναζητούμε τον πρώτο πιλοτικό δήμο μας', 'Γίνετε ο πρώτος πιλοτικός δήμος μας.'],
    ['fr', fr, 'Nous recherchons notre première commune pilote', 'Devenez notre première commune pilote.'],
    ['sr', sr, 'Тражимо нашу прву пилот општину', 'Постаните наша прва пилот општина.'],
] as const)('renders generic pilot copy for a new country in %s', (locale, messages, hero, title) => {
    const html = renderPilotCopy('bosnia', locale, messages);
    expect(html).toContain(`>${hero}<`);
    expect(html).toContain(`>${title}<`);
});

it('preserves existing country-specific pilot copy', () => {
    const html = renderPilotCopy('france', 'en', en);
    expect(html).toContain(`>${en.hero.pilot.france}<`);
    expect(html).toContain(`>${en.pilot.title.france}<`);
});

it.each([
    ['greece', 'greece'], ['cyprus', 'greece'], ['serbia', 'serbia'],
    ['france', 'france'], ['bosnia', 'france'],
] as const)('selects the existing demo scenario for %s', (realm, scenario) => {
    expect(demoScenarioForRealm(realm)).toBe(scenario);
});

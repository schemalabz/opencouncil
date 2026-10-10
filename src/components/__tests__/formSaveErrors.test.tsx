import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import type { Party } from '@prisma/client';
import PartyForm from '@/components/parties/PartyForm';
import { Sheet } from '@/components/ui/sheet';
import { vmsg } from '@/lib/zod-schemas/messages';
import enMain from '../../../messages/en.json';
import elMain from '../../../messages/el.json';
import enValidation from '../../../messages/en/validation.json';
import elValidation from '../../../messages/el/validation.json';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));

const catalogs: Record<string, AbstractIntlMessages> = {
    en: { ...enMain, validation: enValidation },
    el: { ...elMain, validation: elValidation },
};

const fetchMock = jest.fn();

beforeAll(() => {
    global.fetch = fetchMock;
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

beforeEach(() => {
    fetchMock.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

function renderIn(locale: string, ui: React.ReactElement) {
    return render(
        <NextIntlClientProvider locale={locale} messages={catalogs[locale]} onError={() => undefined}>
            {ui}
        </NextIntlClientProvider>,
    );
}

const PARTY = {
    id: 'p1',
    name: 'Λαϊκή Συσπείρωση',
    name_en: 'Laiki Syspirosi',
    name_short: 'ΛΑΣ',
    name_short_en: 'LAS',
    colorHex: '#d32f2f',
    logo: null,
} as Party;

describe('a form that the server refuses', () => {
    it('PartyForm shows the issue of a ValidationError in the language of the reader', async () => {
        fetchMock.mockResolvedValue({
            ok: false,
            status: 400,
            json: async () => ({ error: [{ path: ['colorHex'], message: vmsg('colorHex') }] }),
        });
        renderIn('el', <Sheet open><PartyForm cityId="athens" party={PARTY} /></Sheet>);
        fireEvent.submit(document.querySelector('form')!);
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(`colorHex: ${elValidation.colorHex}`);
    });

    it('PartyForm shows the text that a route wrote for the request', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'A party with this name already exists' }) });
        renderIn('en', <Sheet open><PartyForm cityId="athens" party={PARTY} /></Sheet>);
        fireEvent.submit(document.querySelector('form')!);
        expect(await screen.findByRole('alert')).toHaveTextContent('A party with this name already exists');
    });

    it('PartyForm shows its own message in the language of the reader for a refused guard', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'Not authorized' }) });
        renderIn('el', <Sheet open><PartyForm cityId="athens" party={PARTY} /></Sheet>);
        fireEvent.submit(document.querySelector('form')!);
        expect(await screen.findByRole('alert')).toHaveTextContent(elMain.PartyForm.failedToSaveParty);
    });
});

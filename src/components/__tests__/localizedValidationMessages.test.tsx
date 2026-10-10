import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import type { Offer } from '@prisma/client';
import AddMeetingForm from '@/components/meetings/AddMeetingForm';
import PartyForm from '@/components/parties/PartyForm';
import OfferForm from '@/components/admin/offers/offer-form';
import { ReportForm } from '@/components/admin/reports/ReportForm';
import { Sheet } from '@/components/ui/sheet';
import { transliterateCatalog } from '@/lib/serbian/catalog';
import type { ValidationMessageKey } from '@/lib/zod-schemas/messages';
import enMain from '../../../messages/en.json';
import elMain from '../../../messages/el.json';
import srMain from '../../../messages/sr.json';
import enValidation from '../../../messages/en/validation.json';
import elValidation from '../../../messages/el/validation.json';
import srValidation from '../../../messages/sr/validation.json';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: null }) }));
jest.mock('@/lib/db/offers', () => ({ createOffer: jest.fn(), updateOffer: jest.fn() }));
jest.mock('@/lib/db/cities', () => ({ getCities: jest.fn().mockResolvedValue([]) }));

beforeAll(() => {
    global.fetch = jest.fn().mockResolvedValue({ json: async () => [] });
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

const srCatalog = { ...srMain, validation: srValidation };

const catalogs: Record<string, AbstractIntlMessages> = {
    en: { ...enMain, validation: enValidation },
    el: { ...elMain, validation: elValidation },
    sr: srCatalog,
    'sr-Latn': transliterateCatalog(srCatalog) as AbstractIntlMessages,
};

function customMessage(locale: string, key: ValidationMessageKey): string {
    const validation = catalogs[locale].validation as Record<ValidationMessageKey, string>;
    return validation[key];
}

// The default zod message of `discountPercentage: z.number().min(0)` for -5.
// el is the zod locale (it keeps the English type name); sr is our own map.
const tooSmallDiscount: Record<string, string> = {
    en: 'Too small: expected number to be >=0',
    el: 'Πολύ μικρό: αναμενόταν number να είναι >=0',
    sr: 'Премало: број мора бити најмање 0',
    'sr-Latn': 'Premalo: broj mora biti najmanje 0',
};

function renderIn(locale: string, ui: React.ReactElement) {
    return render(
        <NextIntlClientProvider locale={locale} messages={catalogs[locale]} onError={() => undefined}>
            <Sheet open>{ui}</Sheet>
        </NextIntlClientProvider>,
    );
}

function submit() {
    const form = document.querySelector('form');
    if (!form) throw new Error('no form rendered');
    fireEvent.submit(form);
}

/** The texts of the FormMessage elements: the field errors that the form shows. */
function fieldMessages(): string[] {
    return [...document.querySelectorAll('[id$="-form-item-message"]')].map(element => element.textContent ?? '');
}

async function expectFieldMessages(expected: string[]) {
    await waitFor(() => expect(fieldMessages()).toEqual(expect.arrayContaining(expected)));
}

describe.each(['el', 'en', 'sr', 'sr-Latn'])('validation messages in %s', (locale) => {
    it('AddMeetingForm shows the custom message of a session number below 1', async () => {
        renderIn(locale, <AddMeetingForm cityId="athens" />);
        const sessionNumber = document.querySelector<HTMLInputElement>('input[name="sessionNumber"]');
        if (!sessionNumber) throw new Error('no session number input rendered');
        fireEvent.change(sessionNumber, { target: { value: '0' } });
        submit();
        await expectFieldMessages([customMessage(locale, 'sessionNumberMin1')]);
    });

    it('PartyForm shows the custom messages of empty names and color', async () => {
        renderIn(locale, <PartyForm cityId="athens" />);
        submit();
        await expectFieldMessages([customMessage(locale, 'partyNameMin2'), customMessage(locale, 'colorHex')]);
    });

    it('ReportForm shows the custom messages of an empty city, contract number and period', async () => {
        renderIn(locale, <ReportForm cities={[]} contracts={{}} />);
        submit();
        await expectFieldMessages([
            customMessage(locale, 'cityRequired'),
            customMessage(locale, 'contractReferenceRequired'),
            customMessage(locale, 'periodRequired'),
        ]);
    });

    it('OfferForm shows a custom message and a default zod message', async () => {
        const offer = {
            id: 'offer-1',
            recipientName: 'A',
            discountPercentage: -5,
            platformPrice: 100,
            ingestionPerHourPrice: 10,
            hoursToIngest: 10,
            startDate: new Date('2026-01-01'),
            endDate: new Date('2026-12-31'),
            respondToName: 'Ann Example',
            respondToEmail: 'ann@example.com',
            respondToPhone: '+306900000000',
            type: 'pilot',
            version: 4,
        } satisfies Partial<Offer>;
        renderIn(locale, <OfferForm offer={offer as Offer} />);
        submit();
        await expectFieldMessages([customMessage(locale, 'recipientNameMin2'), tooSmallDiscount[locale]]);
    });
});

import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { RoleDisplay } from '../RoleDisplay';
import type { RoleWithRelations } from '@/lib/db/types';
import messages from '../../../../messages/en.json';

const councilHead = {
    id: 'leader',
    name: 'Council Leader',
    name_en: 'Council Leader',
    isHead: true,
    cityId: 'english-city',
    partyId: null,
    administrativeBodyId: null,
    city: null,
    party: null,
    administrativeBody: null,
    startDate: null,
    endDate: null,
} as RoleWithRelations;

describe('RoleDisplay source language', () => {
    it.each([
        ['en', 'Council Leader'],
        ['el', 'Mayor'],
    ])('renders an English page for %s content as %s', (cityLanguage, expected) => {
        render(
            <NextIntlClientProvider locale="en" messages={{ Person: messages.Person }}>
                <RoleDisplay roles={[{ ...councilHead, name: cityLanguage === 'el' ? 'Δήμαρχος' : councilHead.name }]} cityLanguage={cityLanguage} fullText />
            </NextIntlClientProvider>,
        );

        expect(screen.getByLabelText(expected)).toBeInTheDocument();
    });
});

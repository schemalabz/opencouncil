import React from 'react';
import { fireEvent, render, within } from '@testing-library/react';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'el' }));
jest.mock('next/image', () => ({
    __esModule: true,
    // eslint-disable-next-line @next/next/no-img-element
    default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
jest.mock('@/i18n/routing', () => ({
    Link: ({ children, href, onClick }: React.PropsWithChildren<{ href: string; onClick?: () => void }>) => (
        <a href={href} onClick={onClick}>{children}</a>
    ),
}));
jest.mock('@/components/persons/PersonAvatarList', () => ({ PersonAvatarList: () => null }));
jest.mock('@/hooks/useLocalizeText', () => ({ useLocalizeText: () => (text: string) => text }));
jest.mock('@/lib/analytics/capture', () => ({ captureEvent: jest.fn() }));
// The date's wording is Intl's business; the order and the placing are this component's.
jest.mock('@/lib/formatters/time', () => ({ formatDate: (date: Date) => date.toISOString().slice(0, 10) }));

import { captureEvent } from '@/lib/analytics/capture';
import { RelatedSubjects, type RelatedLevel, type RelatedSubject } from '../RelatedSubjects';

const captureMock = captureEvent as jest.MockedFunction<typeof captureEvent>;

function subject({ id, cityId, cityName, dateTime, name, body }: {
    id: string; cityId: string; cityName: string; dateTime: string; name: string; body?: string;
}): RelatedSubject {
    return {
        id,
        cityId,
        name,
        councilMeetingId: `m-${id}`,
        introducedBy: null,
        contributions: [],
        councilMeeting: {
            id: `m-${id}`,
            cityId,
            dateTime: new Date(dateTime),
            city: { id: cityId, name: cityName, timezone: 'Europe/Athens', logoImage: `/logos/${cityId}.png` },
            administrativeBody: body ? { name: body, name_en: body } : null,
        },
    } as unknown as RelatedSubject;
}

const CURRENT = { dateTime: '2025-06-18T00:00:00.000Z', administrativeBodyName: 'Δημοτικό Συμβούλιο', timezone: 'Europe/Athens' };

const cityLevel: RelatedLevel = {
    scope: 'city',
    subjects: [
        subject({ id: 'old', cityId: 'vrilissia', cityName: 'Βριλήσσια', dateTime: '2023-03-14T00:00:00.000Z', name: 'Προσωρινές ρυθμίσεις', body: 'Επιτροπή Ποιότητας Ζωής' }),
        subject({ id: 'new', cityId: 'vrilissia', cityName: 'Βριλήσσια', dateTime: '2026-02-11T00:00:00.000Z', name: 'Επανεξέταση ρυθμίσεων', body: 'Δημοτικό Συμβούλιο' }),
    ],
    persons: [],
};

const otherLevel: RelatedLevel = {
    scope: 'other',
    subjects: [
        subject({ id: 'ch', cityId: 'chalandri', cityName: 'Χαλάνδρι', dateTime: '2026-09-03T00:00:00.000Z', name: 'Ρυθμίσεις Πεντέλης', body: 'Δημοτική Επιτροπή' }),
    ],
    persons: [],
};

const renderRelated = (levels: [RelatedLevel, ...RelatedLevel[]]) =>
    render(<RelatedSubjects subjectId="seed" subjectName="Κυκλοφοριακές ρυθμίσεις" current={CURRENT} levels={levels} />);

beforeEach(() => captureMock.mockClear());

describe('RelatedSubjects', () => {
    it('places the subject on screen among its municipality\'s neighbours by meeting date', () => {
        const { container } = renderRelated([cityLevel, otherLevel]);

        const entries = Array.from(container.querySelectorAll('ol > li'));
        expect(entries.map(li => li.textContent)).toEqual([
            expect.stringContaining('Προσωρινές ρυθμίσεις'),
            expect.stringContaining('relatedCurrent'),
            expect.stringContaining('Επανεξέταση ρυθμίσεων'),
        ]);
        expect(entries[1].textContent).toContain('Κυκλοφοριακές ρυθμίσεις');
        expect(entries[1].querySelector('a')).toBeNull();
    });

    it('names the meeting\'s date and administrative body above each timeline entry', () => {
        const { container } = renderRelated([cityLevel]);

        const [old, current] = Array.from(container.querySelectorAll('ol > li'));
        expect(old.textContent).toContain('2023-03-14·Επιτροπή Ποιότητας Ζωής');
        expect(current.textContent).toContain('2025-06-18·Δημοτικό Συμβούλιο');
    });

    it('leads each other-municipality row with the municipality\'s logo, name, date and body', () => {
        const { container } = renderRelated([otherLevel]);

        const row = container.querySelector('ul > li') as HTMLElement;
        // The logo is decorative (`alt=""`), so it has no img role.
        expect(row.querySelector('img')?.getAttribute('src')).toBe('/logos/chalandri.png');
        expect(row.textContent).toContain('Χαλάνδρι·2026-09-03·Δημοτική Επιτροπή');
        expect(within(row).getByRole('link').getAttribute('href')).toBe('/chalandri/m-ch/subjects/ch');
    });

    it('draws only the levels it is given', () => {
        const { queryByText } = renderRelated([otherLevel]);

        expect(queryByText('relatedSameCity')).toBeNull();
        expect(queryByText('relatedOtherCities')).not.toBeNull();
    });

    it('reports an opened neighbour with its level and rank', () => {
        const { getByText } = renderRelated([cityLevel, otherLevel]);

        fireEvent.click(getByText('Επανεξέταση ρυθμίσεων'));
        fireEvent.click(getByText('Ρυθμίσεις Πεντέλης'));

        expect(captureMock.mock.calls.map(([event, props]) => [event, props?.scope, props?.rank, props?.subject_id])).toEqual([
            ['subject_opened', 'city', 1, 'new'],
            ['subject_opened', 'other', 0, 'ch'],
        ]);
        expect(captureMock.mock.calls[0][1]).toMatchObject({ surface: 'related_subjects', from_subject_id: 'seed' });
    });
});

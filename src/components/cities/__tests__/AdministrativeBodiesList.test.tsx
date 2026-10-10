import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import AdministrativeBodiesList from '@/components/cities/AdministrativeBodiesList';
import enMain from '../../../../messages/en.json';
import enAdmin from '../../../../messages/en/admin.json';
import enValidation from '../../../../messages/en/validation.json';

const messages = { ...enMain, admin: enAdmin, validation: enValidation } as AbstractIntlMessages;

const fetchMock = jest.fn();

beforeAll(() => {
    global.fetch = fetchMock;
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    // Radix asks an element about pointer capture; jsdom has none.
    Element.prototype.hasPointerCapture = jest.fn(() => false);
    Element.prototype.releasePointerCapture = jest.fn();
});

beforeEach(() => fetchMock.mockReset());

function renderList(ui: React.ReactElement) {
    return render(
        <NextIntlClientProvider locale="en" messages={messages} onError={() => undefined}>
            {ui}
        </NextIntlClientProvider>,
    );
}

// A body whose stored conventions use the anchor names written before
// 2026-09-14. The form holds them in the current vocabulary.
const LEGACY_BODY = {
    id: 'b1',
    name: 'Δημοτικό Συμβούλιο',
    name_en: 'City Council',
    type: 'council' as const,
    youtubeChannelUrl: null,
    contactEmails: ['secretary@example.org'],
    notificationBehavior: 'NOTIFICATIONS_APPROVAL' as const,
    showUnreviewedTranscript: true,
    diavgeiaUnitIds: ['81689'],
    decisionConventions: {
        version: 1,
        rollCallLayout: 'present_and_absent',
        presentListMeaning: 'opening',
        attendanceChangeAnchors: ['session_phase', 'this_document', 'clock_time'],
        statesPerDecisionAttendance: false,
        statesPerVoteAbsence: false,
        usesSubstitutes: false,
        namedVoters: 'dissenters_only',
        mayorStatedSeparately: true,
        provenance: { source: 'profile', profiledAt: '2026-09-13T00:00:00.000Z', documentsSampled: 40 },
    },
};

describe('AdministrativeBodiesList', () => {
    it('opens and saves a body whose conventions use legacy anchor names', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: 'b1' }) });
        const onUpdate = jest.fn();
        renderList(<AdministrativeBodiesList cityId="athens" bodies={[LEGACY_BODY]} onUpdate={onUpdate} />);

        fireEvent.click(screen.getByRole('button', { name: 'Edit Body' }));
        // The anchors show in the current vocabulary.
        expect(await screen.findByRole('checkbox', { name: enAdmin.conventions.attendanceChangeAnchors.phase.label })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: enAdmin.conventions.attendanceChangeAnchors.subject.label })).toBeChecked();

        fireEvent.click(screen.getByRole('button', { name: 'Update' }));

        await waitFor(() => expect(onUpdate).toHaveBeenCalled());
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/cities/athens/administrative-bodies/b1');
        expect(init.method).toBe('PUT');
        expect(JSON.parse(init.body)).toMatchObject({ name: 'Δημοτικό Συμβούλιο', contactEmails: ['secretary@example.org'], diavgeiaUnitIds: '81689' });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});

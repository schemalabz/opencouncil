import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CouncilMeeting, Realm } from '@prisma/client';
import { Sheet } from '@/components/ui/sheet';
import AddMeetingForm from '../AddMeetingForm';

// The kind and the format of a meeting stay unstated until somebody states
// them or reads them from the invitation (#150): the form has no default.

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
    useLocale: () => 'el',
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }) }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

const fetchMock = jest.fn();

beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (init?.method) return { ok: true, json: async () => ({ id: 'm1' }) };
        return { ok: true, json: async () => [] };
    });
    global.fetch = fetchMock as unknown as typeof fetch;
});

function renderForm(meeting?: CouncilMeeting, realm: Realm = 'greece', timezone = 'Europe/Athens') {
    return render(<Sheet open><AddMeetingForm cityId="chania" realm={realm} timezone={timezone} meeting={meeting} /></Sheet>);
}

async function submittedBody(): Promise<Record<string, unknown>> {
    fireEvent.click(screen.getByRole('button', { name: meetingSubmitLabel() }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method)).toBe(true));
    const [, init] = fetchMock.mock.calls.find(([, init]) => init?.method)!;
    return JSON.parse(init.body as string);
}

function meetingSubmitLabel() {
    return /^(addMeeting|updateMeeting)$/;
}

function existingMeeting(fields: Partial<CouncilMeeting>): CouncilMeeting {
    return {
        id: 'mar12_2026', cityId: 'chania', name: null, name_en: null, dateTime: new Date('2026-03-12T16:00:00Z'),
        youtubeUrl: null, agendaUrl: null, videoUrl: null, audioUrl: null, muxPlaybackId: null, calendarEventId: null,
        createdAt: new Date(), updatedAt: new Date(), released: true, administrativeBodyId: null,
        scheduleStatus: 'scheduled', scheduleStatusReason: null, kind: null, urgent: false, sessionNumber: null,
        format: null, closedToPublic: false, place: null, postponedFromId: null,
        continuationOfId: null, hiddenByPostponement: false,
        ...fields,
    } as CouncilMeeting;
}

/** The Radix Selects whose hidden native select holds «Από την πρόσκληση». */
function selectedFromInvitation(container: HTMLElement): number {
    return container.querySelectorAll('option[value="fromInvitation"]:checked').length;
}

describe('AddMeetingForm: kind and format', () => {
    it('sends an urgent meeting when the admin ticks «Έκτακτη»', async () => {
        renderForm();
        const urgent = screen.getByRole('checkbox', { name: 'urgent' });
        expect(urgent).not.toBeChecked();
        fireEvent.click(urgent);
        const body = await submittedBody();
        expect(body.urgent).toBe(true);
        expect(body.kind).toBeNull();
    });

    it('offers «Από την πρόσκληση» for both and sends null for a new meeting', async () => {
        const { container } = renderForm();
        expect(selectedFromInvitation(container)).toBe(2);
        const body = await submittedBody();
        expect(body.kind).toBeNull();
        expect(body.format).toBeNull();
        expect(body.urgent).toBe(false);
    });

    it('keeps the stated kind and format of an existing meeting', async () => {
        const { container } = renderForm(existingMeeting({ kind: 'budget', urgent: true, sessionNumber: 2, format: 'remote' }));
        // Still offered, but not selected.
        expect(selectedFromInvitation(container)).toBe(0);
        const body = await submittedBody();
        expect(body.kind).toBe('budget');
        expect(body.urgent).toBe(true);
        expect(body.format).toBe('remote');
    });
});

describe('AddMeetingForm: a city outside Greece', () => {
    it.each(['france', 'cyprus', 'serbia'] as const)('offers no kind, urgency or session number in %s and sends none', async (realm) => {
        const { container } = renderForm(undefined, realm);
        expect(screen.queryByText('kind')).toBeNull();
        expect(screen.queryByRole('checkbox', { name: 'urgent' })).toBeNull();
        expect(screen.queryByText('sessionNumber')).toBeNull();
        // Only the format keeps «Από την πρόσκληση».
        expect(selectedFromInvitation(container)).toBe(1);
        const body = await submittedBody();
        expect(body).not.toHaveProperty('kind');
        expect(body).not.toHaveProperty('urgent');
        expect(body).not.toHaveProperty('sessionNumber');
        expect(body.format).toBeNull();
        expect(body.scheduleStatus).toBe('scheduled');
    });

    it('offers all three in Greece', () => {
        renderForm();
        expect(screen.getByText('kind')).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: 'urgent' })).toBeInTheDocument();
        expect(screen.getByText('sessionNumber')).toBeInTheDocument();
    });
});

// Jest does not let a test file change the zone of Date, so the fixtures sit on
// both sides of UTC: in any machine zone, at least one of them falls on another
// day, or at another hour, in the browser than in the city.
describe('AddMeetingForm: the city time zone', () => {
    // 18:30 on 3 Nov in Laval is 23:30 UTC, and already 4 Nov in Athens.
    const laval = () => existingMeeting({ id: 'nov3_2026', dateTime: new Date('2026-11-03T23:30:00Z') });
    // 00:30 on 5 Nov in Chania is 22:30 UTC on 4 Nov.
    const chania = () => existingMeeting({ id: 'nov5_2026', dateTime: new Date('2026-11-04T22:30:00Z') });

    it.each([
        ['west of UTC', laval, 'canada', 'America/Toronto', '18:30', '2026-11-03T23:30:00.000Z'],
        ['east of UTC', chania, 'greece', 'Europe/Athens', '00:30', '2026-11-04T22:30:00.000Z'],
    ] as const)('saves an untouched meeting of a city %s at its own instant', async (_side, meeting, realm, timezone, shown, at) => {
        renderForm(meeting(), realm, timezone);
        expect(screen.getByDisplayValue(shown)).toBeInTheDocument();
        const body = await submittedBody();
        expect(body.date).toBe(at);
    });

    it('shows the time of the meeting in the city, whatever the zone of the browser', () => {
        renderForm(laval(), 'canada', 'America/Toronto');
        expect(screen.getByDisplayValue('18:30')).toBeInTheDocument();
    });

    it('reads a typed time in the city', async () => {
        renderForm(laval(), 'canada', 'America/Toronto');
        fireEvent.change(screen.getByDisplayValue('18:30'), { target: { value: '19:00' } });
        const body = await submittedBody();
        expect(body.date).toBe('2026-11-04T00:00:00.000Z');
    });
});

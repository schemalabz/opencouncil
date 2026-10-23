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

// LinkOrDrop uploads through the network; here it is a plain URL field that
// records the upload config each document field hands it.
const uploadConfigs = new Map<string, Record<string, unknown> | undefined>();
jest.mock('@/components/ui/link-or-drop', () => ({
    LinkOrDrop: ({ value, onChange, placeholder, name, config }: {
        value?: string; onChange: (e: unknown) => void; placeholder?: string; name: string; config?: Record<string, unknown>;
    }) => {
        uploadConfigs.set(name, config);
        return <input name={name} placeholder={placeholder} value={value ?? ''} onChange={onChange} />;
    },
}));

const fetchMock = jest.fn();

beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (init?.method) return { ok: true, json: async () => ({ id: 'm1' }) };
        return { ok: true, json: async () => [] };
    });
    global.fetch = fetchMock as unknown as typeof fetch;
});

function renderForm(meeting?: CouncilMeeting, realm: Realm = 'greece') {
    return render(<Sheet open><AddMeetingForm cityId="chania" realm={realm} meeting={meeting} /></Sheet>);
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
        const { container } = renderForm({
            id: 'mar12_2026', cityId: 'chania', name: null, name_en: null, dateTime: new Date('2026-03-12T16:00:00Z'),
            youtubeUrl: null, agendaUrl: null, videoUrl: null, audioUrl: null, muxPlaybackId: null, calendarEventId: null,
            createdAt: new Date(), updatedAt: new Date(), released: true, administrativeBodyId: null,
            scheduleStatus: 'scheduled', scheduleStatusReason: null, kind: 'budget', urgent: true, sessionNumber: 2,
            format: 'remote', closedToPublic: false, place: null, postponedFromId: null,
            continuationOfId: null, hiddenByPostponement: false,
        } as CouncilMeeting);
        // Still offered, but not selected.
        expect(selectedFromInvitation(container)).toBe(0);
        const body = await submittedBody();
        expect(body.kind).toBe('budget');
        expect(body.urgent).toBe(true);
        expect(body.format).toBe('remote');
    });
});

describe('AddMeetingForm: the municipal minutes (#876)', () => {
    // The page payload hides the minutes (hideLinks), so the edited meeting
    // arrives without them; the editor list carries them.
    const MEETING = {
        id: 'mar12_2024', cityId: 'chania', name: null, name_en: null, dateTime: new Date('2024-03-12T16:00:00Z'),
        youtubeUrl: null, agendaUrl: null, municipalMinutesUrl: null,
        videoUrl: null, audioUrl: null, muxPlaybackId: null, calendarEventId: null,
        createdAt: new Date(), updatedAt: new Date(), released: true, administrativeBodyId: null,
        scheduleStatus: 'scheduled', scheduleStatusReason: null, kind: null, urgent: false, sessionNumber: null,
        format: null, closedToPublic: false, place: null, postponedFromId: null,
        continuationOfId: null, hiddenByPostponement: false,
    } as CouncilMeeting;
    const STORED = 'https://example.com/minutes.pdf';

    /** The editor list answers with the edited meeting and its stored minutes. */
    function editorListWithStoredMinutes() {
        fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
            if (init?.method) return { ok: true, json: async () => ({ id: 'm1' }) };
            if (url.includes('includeUnreleased=true')) {
                return { ok: true, json: async () => [{
                    id: MEETING.id, name: null, name_en: null, kind: null, urgent: false, sessionNumber: null,
                    dateTime: '2024-03-12T16:00:00.000Z', scheduleStatus: 'scheduled', administrativeBodyId: null,
                    administrativeBody: null, postponedFromId: null, municipalMinutesUrl: STORED,
                }] };
            }
            return { ok: true, json: async () => [] };
        });
    }
    const minutesInput = () => screen.getByPlaceholderText('meetingMunicipalMinutesPlaceholder') as HTMLInputElement;

    it('shows the stored minutes from the editor list, and an untouched edit leaves them as they are', async () => {
        editorListWithStoredMinutes();
        renderForm(MEETING);
        await waitFor(() => expect(minutesInput().value).toBe(STORED));

        const body = await submittedBody();
        // Absent: the API keeps the stored value. An empty field would clear it.
        expect(body).not.toHaveProperty('municipalMinutesUrl');
    });

    it('sends the minutes that the admin types, for a new meeting or an edit', async () => {
        renderForm();
        fireEvent.change(minutesInput(), { target: { value: 'https://example.com/new-minutes.pdf' } });
        const body = await submittedBody();
        expect(body.municipalMinutesUrl).toBe('https://example.com/new-minutes.pdf');
    });

    it('clears the stored minutes when the admin empties the field', async () => {
        editorListWithStoredMinutes();
        renderForm(MEETING);
        await waitFor(() => expect(minutesInput().value).toBe(STORED));

        fireEvent.change(minutesInput(), { target: { value: '' } });
        const body = await submittedBody();
        expect(body.municipalMinutesUrl).toBe('');
    });
});

describe('AddMeetingForm: uploads', () => {
    it('gives every document upload the meeting and its body, so a body admin may upload', async () => {
        uploadConfigs.clear();
        renderForm({
            id: 'mar12_2024', cityId: 'chania', name: null, name_en: null, dateTime: new Date('2024-03-12T16:00:00Z'),
            youtubeUrl: null, agendaUrl: null, municipalMinutesUrl: null,
            videoUrl: null, audioUrl: null, muxPlaybackId: null, calendarEventId: null,
            createdAt: new Date(), updatedAt: new Date(), released: false, administrativeBodyId: 'committee-1',
            scheduleStatus: 'scheduled', scheduleStatusReason: null, kind: null, urgent: false, sessionNumber: null,
            format: null, closedToPublic: false, place: null, postponedFromId: null,
            continuationOfId: null, hiddenByPostponement: false,
        } as CouncilMeeting);

        for (const [field, suffix] of [['youtubeUrl', 'recording'], ['agendaUrl', 'agenda'], ['municipalMinutesUrl', 'municipalMinutes']]) {
            expect([field, uploadConfigs.get(field)]).toEqual([field, expect.objectContaining({
                cityId: 'chania', councilMeetingId: 'mar12_2024', administrativeBodyId: 'committee-1', suffix,
            })]);
        }
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

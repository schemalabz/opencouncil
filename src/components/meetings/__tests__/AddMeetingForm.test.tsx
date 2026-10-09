import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CouncilMeeting } from '@prisma/client';
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

function renderForm(meeting?: CouncilMeeting) {
    return render(<Sheet open><AddMeetingForm cityId="chania" meeting={meeting} /></Sheet>);
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
    it('offers «Από την πρόσκληση» for both and sends null for a new meeting', async () => {
        const { container } = renderForm();
        expect(selectedFromInvitation(container)).toBe(2);
        const body = await submittedBody();
        expect(body.kind).toBeNull();
        expect(body.format).toBeNull();
    });

    it('keeps the stated kind and format of an existing meeting', async () => {
        const { container } = renderForm({
            id: 'mar12_2026', cityId: 'chania', name: null, name_en: null, dateTime: new Date('2026-03-12T16:00:00Z'),
            youtubeUrl: null, agendaUrl: null, videoUrl: null, audioUrl: null, muxPlaybackId: null, calendarEventId: null,
            createdAt: new Date(), updatedAt: new Date(), released: true, administrativeBodyId: null,
            scheduleStatus: 'scheduled', scheduleStatusReason: null, kind: 'urgent', sessionNumber: 2,
            format: 'remote', closedToPublic: false, place: null, postponedFromId: null,
            continuationOfId: null, hiddenByPostponement: false,
        } as CouncilMeeting);
        // Still offered, but not selected.
        expect(selectedFromInvitation(container)).toBe(0);
        const body = await submittedBody();
        expect(body.kind).toBe('urgent');
        expect(body.format).toBe('remote');
    });
});

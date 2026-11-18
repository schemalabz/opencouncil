// The form sends what agendaRequestFields maps: in text mode the pasted text
// and no link, so the server (agendaLinkOf) does not answer 400 to a meeting
// that has a stored link. meetingFormRequest.test covers the mapping; this
// covers that the form uses it.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CouncilMeeting } from '@prisma/client';
import { Sheet } from '@/components/ui/sheet';
import AddMeetingForm from '../AddMeetingForm';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'el' }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }) }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

const fetchMock = jest.fn();
beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => ({ ok: true, json: async () => (init?.method ? { id: 'm1' } : []) }));
    global.fetch = fetchMock as unknown as typeof fetch;
});

const meeting = {
    id: 'mar12_2026', cityId: 'chania', name: null, name_en: null, dateTime: new Date('2026-03-12T16:00:00Z'),
    youtubeUrl: null, agendaUrl: 'https://example.org/agenda.pdf', videoUrl: null, audioUrl: null, muxPlaybackId: null, calendarEventId: null,
    createdAt: new Date(), updatedAt: new Date(), released: true, administrativeBodyId: null,
    scheduleStatus: 'scheduled', scheduleStatusReason: null, kind: null, urgent: false, sessionNumber: null,
    format: null, closedToPublic: false, place: null, postponedFromId: null, continuationOfId: null, hiddenByPostponement: false,
} as unknown as CouncilMeeting;

it('sends the pasted text and no link for a meeting that has a stored link (#829)', async () => {
    render(<Sheet open><AddMeetingForm cityId="chania" realm="greece" timezone="Europe/Athens" meeting={meeting} /></Sheet>);
    fireEvent.click(screen.getByRole('button', { name: 'agendaAsText' }));
    fireEvent.change(await screen.findByPlaceholderText('agendaTextPlaceholder'), { target: { value: '1. Σχολικές αυλές' } });
    fireEvent.click(screen.getByRole('button', { name: /^(addMeeting|updateMeeting)$/ }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method)).toBe(true));
    const [, init] = fetchMock.mock.calls.find(([, init]) => init?.method)!;
    const body = JSON.parse(init.body as string);
    expect(body.agendaText).toBe('1. Σχολικές αυλές');
    expect(body).not.toHaveProperty('agendaUrl');
});

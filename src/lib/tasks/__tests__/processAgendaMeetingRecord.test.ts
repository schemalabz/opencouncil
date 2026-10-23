/** @jest-environment node */
import { handleProcessAgendaResult } from '../processAgenda';
import type { AgendaMeetingInAgenda, ProcessAgendaResult } from '../../apiTypes';

const councilMeeting = (realm: string) => ({
    id: 'feb25_2026', cityId: 'chalandri', name: null, name_en: null, kind: null, urgent: false, sessionNumber: null, format: 'inPerson',
    continuationOfId: null, dateTime: new Date('2026-02-25T17:00:00Z'),
    city: { name: 'Χαλάνδρι', name_en: 'Chalandri', name_municipality: 'Δήμος Χαλανδρίου', realm, timezone: 'Europe/Athens' },
    administrativeBody: { name: 'Δημοτικό Συμβούλιο', name_en: 'City Council', type: 'council', notificationBehavior: 'NOTIFICATIONS_DISABLED' },
});
const mockFindTask = jest.fn();
jest.mock('../../db/prisma', () => ({
    __esModule: true,
    default: {
        taskStatus: { findUnique: (...a: unknown[]) => mockFindTask(...a) },
        city: { findMany: jest.fn().mockResolvedValue([{ name_municipality: 'Δήμος Ζωγράφου' }]) },
    },
}));
const mockSave = jest.fn().mockResolvedValue(new Map());
jest.mock('../../db/utils', () => ({ saveSubjectsForMeeting: (...a: unknown[]) => mockSave(...a) }));
jest.mock('../../auth', () => ({ withUserAuthorizedToEdit: jest.fn() }));
jest.mock('../../subjectImages', () => ({ generateImagesForMeeting: jest.fn() }));
jest.mock('../../cache', () => ({ revalidateMeeting: jest.fn() }));
jest.mock('next/server', () => ({ ...jest.requireActual('next/server'), after: jest.fn() }));
jest.mock('../processAgendaInternal', () => ({ requestProcessAgendaInternal: jest.fn() }));
const mockApply = jest.fn();
jest.mock('../applyAgendaMeetingRecord', () => ({ applyAgendaMeetingRecord: (...a: unknown[]) => mockApply(...a) }));
const mockCompleted = jest.fn().mockResolvedValue(undefined);
const mockToDecide = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/discord', () => ({
    sendTaskAdminAlert: (...a: unknown[]) => mockCompleted(...a),
    sendAgendaReadingAlert: (...a: unknown[]) => mockToDecide(...a),
}));

const inAgenda = (o: Partial<AgendaMeetingInAgenda> = {}): AgendaMeetingInAgenda => ({
    kind: 'ordinary', kindEvidence: null, urgent: false, urgentEvidence: null, sessionNumber: 12, sessionNumberEvidence: '12η', format: null, formatEvidence: null,
    municipality: 'ΔΗΜΟΣ ΧΑΛΑΝΔΡΙΟΥ', bodyName: 'ΔΗΜΟΤΙΚΟ ΣΥΜΒΟΥΛΙΟ', ofThisBody: true, date: '2026-02-25', time: '19:00', subjectCount: 0, isThisMeeting: true, ...o,
});
const v7 = (m: AgendaMeetingInAgenda): ProcessAgendaResult => ({ subjects: [], meetingRecord: m, meetingsInAgenda: [m] });

describe('handleProcessAgendaResult: the meeting record', () => {
    beforeEach(() => { jest.clearAllMocks(); mockApply.mockResolvedValue({ written: {}, problems: [] }); });

    it("refuses another city's agenda before the subjects are saved", async () => {
        mockFindTask.mockResolvedValue({ id: 't', councilMeeting: councilMeeting('greece') });
        await expect(handleProcessAgendaResult('t', v7(inAgenda({ municipality: 'ΔΗΜΟΣ ΖΩΓΡΑΦΟΥ' })))).rejects.toThrow('the agenda is from ΔΗΜΟΣ ΖΩΓΡΑΦΟΥ');
        expect(mockSave).not.toHaveBeenCalled();
        expect(mockApply).not.toHaveBeenCalled();
    });

    it('saves an agenda of another body and passes the difference to the alert', async () => {
        mockFindTask.mockResolvedValue({ id: 't', councilMeeting: councilMeeting('greece') });
        await expect(handleProcessAgendaResult('t', v7(inAgenda({ bodyName: 'Δημοτική Επιτροπή', ofThisBody: false })))).resolves.toBeUndefined();
        expect(mockSave).toHaveBeenCalled();
        expect(mockApply.mock.calls[0][3]).toEqual(["body: the agenda calls Δημοτική Επιτροπή, not this meeting's body"]);
    });

    it('neither checks nor applies outside Greece, and still reports the agenda', async () => {
        mockFindTask.mockResolvedValue({ id: 't', councilMeeting: councilMeeting('serbia') });
        await expect(handleProcessAgendaResult('t', v7(inAgenda({ municipality: 'ΔΗΜΟΣ ΖΩΓΡΑΦΟΥ' })))).resolves.toBeUndefined();
        expect(mockSave).toHaveBeenCalled();
        expect(mockApply).not.toHaveBeenCalled();
        expect(mockCompleted.mock.calls[0][0].details).toEqual([{ name: 'Subjects', value: '0', inline: true }]);
        expect(mockToDecide).not.toHaveBeenCalled();
    });

    it('sends the task alert of a success, with what the invitation states and what was written', async () => {
        mockFindTask.mockResolvedValue({ id: 't', councilMeeting: councilMeeting('greece') });
        mockApply.mockResolvedValue({ written: { format: 'byCirculation', sessionNumber: 12 }, problems: [] });
        const read = inAgenda({ format: 'byCirculation', formatEvidence: 'δια περιφοράς' });
        await handleProcessAgendaResult('t', { ...v7(read), subjects: [{ name: 'Θέμα', agendaItemIndex: 1 }] as ProcessAgendaResult['subjects'] });
        expect(mockCompleted).toHaveBeenCalledTimes(1);
        expect(mockCompleted.mock.calls[0][0]).toMatchObject({
            status: 'completed', taskType: 'processAgenda', taskId: 't', meetingId: 'feb25_2026',
            details: [
                { name: 'From the invitation', value: 'Kind: ordinary\nUrgent: no\nNumber: 12 (filled)\nFormat: byCirculation (filled) «δια περιφοράς»' },
                { name: 'Subjects', value: '1', inline: true },
            ],
        });
        expect(mockToDecide).not.toHaveBeenCalled();
    });

    it('does not fail the task when applying the record throws after the subjects are saved', async () => {
        mockFindTask.mockResolvedValue({ id: 't', councilMeeting: councilMeeting('greece') });
        mockApply.mockRejectedValue(new Error('connection reset'));
        await expect(handleProcessAgendaResult('t', v7(inAgenda()))).resolves.toBeUndefined();
        expect(mockSave).toHaveBeenCalled();
        expect(mockCompleted).toHaveBeenCalledTimes(1);
        expect(mockToDecide.mock.calls[0][0].problems).toEqual(['the meeting record was not applied: connection reset']);
    });
});

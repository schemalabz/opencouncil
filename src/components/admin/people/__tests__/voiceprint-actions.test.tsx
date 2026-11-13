// The admin dialog: Generate only with a consent, the right note without one,
// and a refusal value shown as a toast (not treated as a task).
import { createElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { VoiceprintActions } from '../voiceprint-actions';

const mockToast = jest.fn();
const mockRequestGenerate = jest.fn();
// A stable router, as Next gives: a new object per render would re-run the task fetch on every render.
const mockRouter = { refresh: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('@/lib/actions/tasks', () => ({ requestGenerateVoiceprint: (...args: unknown[]) => mockRequestGenerate(...args) }));
jest.mock('@/lib/db/tasks', () => ({ getVoiceprintTasksForPerson: jest.fn(async () => []), deleteTaskStatus: jest.fn() }));
jest.mock('@/lib/db/voiceprints', () => ({ deleteVoicePrint: jest.fn() }));
jest.mock('@/components/meetings/admin/TaskList', () => ({ __esModule: true, default: ({ tasks }: { tasks: unknown[] }) => createElement('div', null, `tasks ${tasks.length}`) }));

const voicePrint = { id: 'v1', createdAt: new Date('2026-10-01T10:00:00Z'), startTimestamp: 0, endTimestamp: 30 } as never;
const open = (consentGiven: boolean, vp: unknown = null) => {
    render(createElement(VoiceprintActions, { personId: 'p1', personName: 'Α. Β.', voicePrint: vp as never, consentGiven }));
    fireEvent.click(screen.getByRole('button', { name: /Voiceprint/ }));
};

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('VoiceprintActions', () => {
    it('offers Generate only with a consent in force', async () => {
        open(true);
        expect(await screen.findByText('Generate Voiceprint')).toBeTruthy();
    });

    it('without a consent, offers no Generate and says why', async () => {
        open(false);
        expect(await screen.findByText(/No voiceprint can be generated until they consent/)).toBeTruthy();
        expect(screen.queryByText('Generate Voiceprint')).toBeNull();
    });

    it('without a consent, says that a stored voiceprint is not used', async () => {
        open(false, voicePrint);
        expect(await screen.findByText(/The stored voiceprint is not used until they consent/)).toBeTruthy();
    });

    it('shows a refusal as a destructive toast, and adds no task', async () => {
        mockRequestGenerate.mockResolvedValue({ ok: false, message: 'Speaker segment is too short (20.0s).' });
        open(true);
        fireEvent.click(await screen.findByText('Generate Voiceprint'));
        await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Voiceprint not generated', description: 'Speaker segment is too short (20.0s).', variant: 'destructive',
        })));
        expect(screen.getByText('tasks 0')).toBeTruthy();
        expect(screen.getByText('Generate Voiceprint')).toBeTruthy();
    });

    it('tracks the task on success', async () => {
        mockRequestGenerate.mockResolvedValue({ ok: true, task: { id: 't1', status: 'pending', updatedAt: new Date() } });
        open(true);
        fireEvent.click(await screen.findByText('Generate Voiceprint'));
        expect(await screen.findByText('tasks 1')).toBeTruthy();
        expect(screen.queryByText('Generate Voiceprint')).toBeNull();
    });
});

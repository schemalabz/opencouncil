// The admin dialog: the samples only with a consent, the right note without one,
// and a refusal value shown as a toast (not treated as a task).
import { createElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { VoiceprintActions } from '../voiceprint-actions';

const mockToast = jest.fn();
const mockRequestGenerate = jest.fn();
const mockGetSamples = jest.fn();
const mockGetTasks = jest.fn();
// A stable router, as Next gives: a new object per render would re-run the task fetch on every render.
const mockRouter = { refresh: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('@/lib/actions/tasks', () => ({
    requestGenerateVoiceprint: (...args: unknown[]) => mockRequestGenerate(...args),
    getVoiceprintSamples: (...args: unknown[]) => mockGetSamples(...args),
}));
jest.mock('@/lib/db/tasks', () => ({ getVoiceprintTasksForPerson: (...args: unknown[]) => mockGetTasks(...args), deleteTaskStatus: jest.fn() }));
jest.mock('@/lib/db/voiceprints', () => ({ deleteVoicePrint: jest.fn() }));
jest.mock('@/components/meetings/admin/TaskList', () => ({ __esModule: true, default: ({ tasks }: { tasks: unknown[] }) => createElement('div', null, `tasks ${tasks.length}`) }));

const voicePrint = { id: 'v1', createdAt: new Date('2026-10-01T10:00:00Z'), startTimestamp: 0, endTimestamp: 30 } as never;
const open = (consentGiven: boolean, vp: unknown = null) => {
    render(createElement(VoiceprintActions, { personId: 'p1', personName: 'Α. Β.', voicePrint: vp as never, consentGiven }));
    fireEvent.click(screen.getByRole('button', { name: /Voiceprint/ }));
};

const sample = (segmentId: string, meetingName: string) => ({ segmentId, meetingName, mediaUrl: 'https://cdn/a.mp3', startTimestamp: 100, endTimestamp: 130 });

beforeEach(() => {
    jest.clearAllMocks();
    mockGetSamples.mockResolvedValue([sample('s1', 'Meeting A'), sample('s2', 'Meeting B')]);
    mockGetTasks.mockResolvedValue([]);
    // jsdom has no media playback.
    jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('VoiceprintActions', () => {
    it('asks for no samples before the task list says that no task is pending', async () => {
        let answerTasks: (tasks: unknown[]) => void = () => {};
        mockGetTasks.mockReturnValue(new Promise(resolve => { answerTasks = resolve; }));
        open(true);
        await screen.findByText('tasks 0');
        expect(mockGetSamples).not.toHaveBeenCalled();

        answerTasks([{ id: 't1', status: 'pending', updatedAt: new Date() }]);
        expect(await screen.findByText(/Currently generating a voiceprint/)).toBeTruthy();
        expect(mockGetSamples).not.toHaveBeenCalled();
    });

    it('stops at the end of the window and goes back to its start', async () => {
        open(true);
        await screen.findByText('Meeting A');
        const audio = document.querySelector('audio') as HTMLAudioElement;
        audio.currentTime = 130.2;
        fireEvent.timeUpdate(audio);
        expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
        expect(audio.currentTime).toBe(100);
    });

    it('says how to go on when the only sample cannot play', async () => {
        mockGetSamples.mockResolvedValue([sample('s1', 'Meeting A')]);
        open(true);
        await screen.findByText('Meeting A');
        fireEvent.error(document.querySelector('audio') as HTMLAudioElement);
        expect(await screen.findByText(/Close the dialog and open it again/)).toBeTruthy();
    });

    it('offers the samples only with a consent in force', async () => {
        open(true);
        expect(await screen.findByText('Use this sample')).toBeTruthy();
        expect(screen.getByText('Meeting A')).toBeTruthy();
    });

    it('plays the first sample on request, and the next one at once', async () => {
        open(true);
        await screen.findByText('Meeting A');
        expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();

        fireEvent.click(screen.getByText('Another one'));
        expect(await screen.findByText('Meeting B')).toBeTruthy();
        expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    });

    it('without a consent, offers no sample and says why', async () => {
        open(false);
        expect(await screen.findByText(/No voiceprint can be generated until they consent/)).toBeTruthy();
        expect(screen.queryByText('Use this sample')).toBeNull();
        expect(mockGetSamples).not.toHaveBeenCalled();
    });

    it('without a consent, says that a stored voiceprint is not used', async () => {
        open(false, voicePrint);
        expect(await screen.findByText(/The stored voiceprint is not used until they consent/)).toBeTruthy();
    });

    it('shows a refusal as a destructive toast, and adds no task', async () => {
        mockRequestGenerate.mockResolvedValue({ ok: false, message: 'The meeting has no media to cut a voiceprint from' });
        open(true);
        fireEvent.click(await screen.findByText('Use this sample'));
        await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Voiceprint not generated', description: 'The meeting has no media to cut a voiceprint from', variant: 'destructive',
        })));
        expect(mockRequestGenerate).toHaveBeenCalledWith('p1', 's1');
        expect(screen.getByText('tasks 0')).toBeTruthy();
        expect(await screen.findByText('Use this sample')).toBeTruthy();
    });

    it('stays on the sample that was refused', async () => {
        mockRequestGenerate.mockResolvedValue({ ok: false, message: 'The meeting has no media to cut a voiceprint from' });
        open(true);
        fireEvent.click(await screen.findByText('Another one'));
        await screen.findByText('Meeting B');

        fireEvent.click(screen.getByText('Use this sample'));
        await waitFor(() => expect(mockToast).toHaveBeenCalled());

        expect(mockRequestGenerate).toHaveBeenCalledWith('p1', 's2');
        expect(screen.getByText('Meeting B')).toBeTruthy();
        expect(mockGetSamples).toHaveBeenCalledTimes(1);
    });

    it('tracks the task on success', async () => {
        mockRequestGenerate.mockResolvedValue({ ok: true, task: { id: 't1', status: 'pending', updatedAt: new Date() } });
        open(true);
        fireEvent.click(await screen.findByText('Use this sample'));
        expect(await screen.findByText('tasks 1')).toBeTruthy();
        expect(screen.queryByText('Use this sample')).toBeNull();
    });
});

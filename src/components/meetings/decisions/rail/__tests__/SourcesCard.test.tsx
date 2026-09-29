import { render, screen, fireEvent } from '@testing-library/react';
import { SourcesCard, type SourcesPanel } from '../SourcesCard';
import type { MeetingFactSource } from '../../useMeetingFactSources';
import type { MeetingFactsReading } from '@/lib/apiTypes';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, params?: Record<string, unknown>) =>
        params ? `${key}${JSON.stringify(params)}` : key,
    useLocale: () => 'el',
}));

const reading = (o: Partial<MeetingFactsReading> = {}): MeetingFactsReading => ({
    rollCall: { entries: [], rawText: '', utteranceIds: [] },
    attendanceChanges: [],
    votes: [],
    presidedBy: null,
    nameMatches: [],
    unmatchedNames: [],
    warnings: [],
    ...o,
});

const row = (o: Partial<MeetingFactSource>): MeetingFactSource => ({
    id: 'row', source: 'sheet', status: 'uploaded', fileName: 'sheet.jpg', mediaType: 'image/jpeg', reading: null, readerVersion: null,
    taskId: 't1', uploadedById: null, confirmedById: null, confirmedAt: null,
    createdAt: '2026-06-15T18:00:00.000Z', updatedAt: '2026-06-15T18:00:00.000Z', ...o,
});

function renderCard(overrides: Partial<SourcesPanel> = {}) {
    const props: SourcesPanel = {
        sources: [],
        loadFailed: false,
        busy: null,
        isReading: () => false,
        failure: () => null,
        timezone: 'Europe/Athens',
        onUpload: jest.fn(),
        onReread: jest.fn(),
        onRemove: jest.fn(),
        onReadTranscript: jest.fn(),
        ...overrides,
    };
    return { ...render(<SourcesCard {...props} />), props };
}

describe('SourcesCard', () => {
    it('offers an upload when no sheet exists, and sends the chosen file', () => {
        const { props } = renderCard();
        expect(screen.getByText('sources.sheet.none')).toBeInTheDocument();
        const input = screen.getByLabelText('sources.sheet.upload') as HTMLInputElement;
        expect(input).toHaveAttribute('accept', 'image/*,application/pdf');
        const file = new File(['x'], 'sheet.jpg', { type: 'image/jpeg' });
        fireEvent.change(input, { target: { files: [file] } });
        expect(props.onUpload).toHaveBeenCalledWith(file);
    });

    it('says the reader is on its way for an uploaded sheet, with the file name, and offers only removal', () => {
        renderCard({ sources: [row({ status: 'uploaded' })], isReading: source => source === 'sheet' });
        expect(screen.getByText('sources.sheet.reading{"file":"sheet.jpg"}')).toBeInTheDocument();
        expect(screen.queryByText('sources.sheet.reread')).not.toBeInTheDocument();
        expect(screen.getByText('sources.sheet.remove')).toBeInTheDocument();
    });

    it('offers a read again for an uploaded sheet whose reader never started', () => {
        const { props } = renderCard({ sources: [row({ status: 'uploaded', taskId: null })] });
        expect(screen.getByText('sources.sheet.uploaded')).toBeInTheDocument();
        fireEvent.click(screen.getByText('sources.sheet.reread'));
        expect(props.onReread).toHaveBeenCalledTimes(1);
    });

    it('says a read failed, with the reader\'s sentence, and offers a read again', () => {
        const { props } = renderCard({
            sources: [row({ status: 'uploaded', taskId: 't9' })],
            failure: source => (source === 'sheet' ? 'credit balance is too low' : null),
        });
        expect(screen.getByText('sources.readFailed{"error":"credit balance is too low"}')).toBeInTheDocument();
        fireEvent.click(screen.getByText('sources.sheet.reread'));
        expect(props.onReread).toHaveBeenCalledTimes(1);
    });

    it('says a transcript read failed, beside the button to read again', () => {
        renderCard({ failure: source => (source === 'transcript' ? 'boom' : null) });
        expect(screen.getByText('sources.readFailed{"error":"boom"}')).toBeInTheDocument();
        expect(screen.getByText('sources.transcript.readButton')).toBeInTheDocument();
    });

    it('dates a read sheet and offers a second read', () => {
        const { props } = renderCard({
            sources: [row({ status: 'read', reading: reading(), updatedAt: '2026-06-16T09:30:00.000Z' })],
        });
        expect(screen.getByText(/^sources\.sheet\.read\{"date":".+"\}$/)).toBeInTheDocument();
        fireEvent.click(screen.getByText('sources.sheet.reread'));
        expect(props.onReread).toHaveBeenCalledTimes(1);
    });

    it('removes the sheet only after the person confirms', () => {
        const confirmSpy = jest.spyOn(window, 'confirm');
        const { props } = renderCard({ sources: [row({ status: 'read', reading: reading() })] });
        confirmSpy.mockReturnValueOnce(false);
        fireEvent.click(screen.getByText('sources.sheet.remove'));
        expect(props.onRemove).not.toHaveBeenCalled();
        confirmSpy.mockReturnValueOnce(true);
        fireEvent.click(screen.getByText('sources.sheet.remove'));
        expect(props.onRemove).toHaveBeenCalledTimes(1);
        confirmSpy.mockRestore();
    });

    it('shows the reader\'s warnings and the names it matched to nobody', () => {
        renderCard({
            sources: [row({
                status: 'read',
                reading: reading({ warnings: [{ code: 'BLURRY', severity: 'warning', message: 'The lower half is blurred' }], unmatchedNames: ['Κ. Δήμου'] }),
            })],
        });
        expect(screen.getByText('sources.warnings')).toBeInTheDocument();
        expect(screen.getByText('The lower half is blurred')).toBeInTheDocument();
        expect(screen.getByText('sources.unmatchedNames{"names":"Κ. Δήμου"}')).toBeInTheDocument();
    });

    it('offers to read a transcript nobody has read yet', () => {
        const { props } = renderCard();
        expect(screen.getByText('sources.transcript.none')).toBeInTheDocument();
        fireEvent.click(screen.getByText('sources.transcript.readButton'));
        expect(props.onReadTranscript).toHaveBeenCalledTimes(1);
    });

    it('says the transcript reader is on its way, and disables the read meanwhile', () => {
        renderCard({ isReading: source => source === 'transcript' });
        expect(screen.getByText('sources.transcript.reading')).toBeInTheDocument();
        expect(screen.getByText('sources.transcript.readButton').closest('button')).toBeDisabled();
    });

    it('dates a read transcript, counts what it states, and offers a second read', () => {
        const { props } = renderCard({
            sources: [row({
                id: 'tr', source: 'transcript', status: 'read', fileName: null, mediaType: null,
                reading: reading({
                    rollCall: { entries: [{ name: 'A', personId: 'p1', status: 'PRESENT', absenceJustified: null, rawText: 'A', utteranceId: 'u1', line: null }], rawText: '', utteranceIds: [] },
                    attendanceChanges: [],
                    votes: [],
                }),
            })],
        });
        expect(screen.getByText(/^sources\.transcript\.read\{"date":".+"\}$/)).toBeInTheDocument();
        expect(screen.getByText('sources.transcript.counts{"entries":1,"changes":0,"votes":0}')).toBeInTheDocument();
        fireEvent.click(screen.getByText('sources.transcript.reread'));
        expect(props.onReadTranscript).toHaveBeenCalledTimes(1);
    });

    it('reports a failed load rather than an empty card', () => {
        renderCard({ sources: null, loadFailed: true });
        expect(screen.getByText('sources.loadFailed')).toBeInTheDocument();
        expect(screen.queryByText('sources.sheet.none')).not.toBeInTheDocument();
    });
});

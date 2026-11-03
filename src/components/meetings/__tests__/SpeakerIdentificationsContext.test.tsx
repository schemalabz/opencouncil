import { render, screen, waitFor } from '@testing-library/react';
import { SpeakerIdentificationsProvider, useSpeakerIdentifications } from '../SpeakerIdentificationsContext';
import { getSpeakerIdentificationsForMeeting } from '@/lib/actions/speakerTags';
import { listSpeakerSuggestions } from '@/lib/speakerIdentifications';

jest.mock('@/lib/actions/speakerTags', () => ({ getSpeakerIdentificationsForMeeting: jest.fn() }));
let mockEditable = true;
let mockTags = [{ id: 'tag', label: 'Speaker 1', personId: null as string | null, personSetBy: null as string | null }];
jest.mock('../CouncilMeetingDataContext', () => ({
    useCouncilMeetingMeta: () => ({ meeting: { cityId: 'city', id: 'meeting' }, speakerTags: mockTags }),
}));
jest.mock('../options/OptionsContext', () => ({
    useTranscriptOptions: () => ({ options: { editable: mockEditable } }),
}));

function Probe() {
    const { getIdentifications, hasSuggestion, needsReview } = useSpeakerIdentifications();
    const suggestions = listSpeakerSuggestions(getIdentifications('tag'));
    return <>
        {suggestions.map(s => <span key={s.personId ?? s.name}>{s.personId ?? s.name}: {s.evidence}</span>)}
        {hasSuggestion('tag') && <span>Suggestion available</span>}
        {needsReview('tag') && <span>Methods disagree</span>}
    </>;
}
const tree = () => <SpeakerIdentificationsProvider><Probe /></SpeakerIdentificationsProvider>;

beforeEach(() => {
    jest.clearAllMocks();
    mockEditable = true;
    mockTags = [{ id: 'tag', label: 'Speaker 1', personId: null, personSetBy: null }];
    jest.mocked(getSpeakerIdentificationsForMeeting).mockResolvedValue([
        { speakerTagId: 'tag', method: 'transcript', personId: null, name: 'Meeting secretary', actionable: false, confidence: 70, evidence: 'Reading the minutes' },
    ]);
});

it('retains held-back visitor suggestions and their evidence for editors', async () => {
    render(tree());
    expect(await screen.findByText('Meeting secretary: Reading the minutes')).toBeInTheDocument();
    expect(screen.getByText('Suggestion available')).toBeInTheDocument();
    expect(screen.queryByText('Methods disagree')).not.toBeInTheDocument();
});

it('follows a saved reviewer decision without discarding the evidence', async () => {
    const { rerender } = render(tree());
    await screen.findByText('Suggestion available');
    mockTags = [{ id: 'tag', label: 'A different label', personId: null, personSetBy: 'user' }];
    rerender(tree());
    expect(screen.queryByText('Suggestion available')).not.toBeInTheDocument();
    expect(screen.getByText('Meeting secretary: Reading the minutes')).toBeInTheDocument();
});

it('never fetches or exposes suggestions outside editing mode', async () => {
    mockEditable = false;
    const { rerender } = render(tree());
    expect(getSpeakerIdentificationsForMeeting).not.toHaveBeenCalled();
    expect(screen.queryByText('Suggestion available')).not.toBeInTheDocument();
    mockEditable = true;
    rerender(tree());
    await screen.findByText('Suggestion available');
    mockEditable = false;
    rerender(tree());
    await waitFor(() => expect(screen.queryByText('Meeting secretary: Reading the minutes')).not.toBeInTheDocument());
});

it('uses the shared ownership rule for both the warning and the suggestion cue', async () => {
    mockTags = [{ id: 'tag', label: 'Speaker 1', personId: 'anna', personSetBy: null }];
    jest.mocked(getSpeakerIdentificationsForMeeting).mockResolvedValue([
        { speakerTagId: 'tag', method: 'voiceprint', personId: 'anna', name: null, actionable: true, confidence: 95, evidence: null },
        { speakerTagId: 'tag', method: 'transcript', personId: 'babis', name: null, actionable: true, confidence: 90, evidence: 'Given the floor' },
    ]);
    render(tree());
    await screen.findByText('babis: Given the floor');
    expect(screen.queryByText('Methods disagree')).not.toBeInTheDocument();
    expect(screen.queryByText('Suggestion available')).not.toBeInTheDocument();
});

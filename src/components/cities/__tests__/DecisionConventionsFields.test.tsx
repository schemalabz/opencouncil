import { render, screen, fireEvent } from '@testing-library/react';
import DecisionConventionsFields from '../DecisionConventionsFields';
import type { DecisionConventions } from '@/lib/decisionConventions';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, params?: Record<string, unknown>) =>
        params ? `${key}${JSON.stringify(params)}` : key,
}));

const PROFILED: DecisionConventions = {
    version: 1,
    rollCallLayout: 'present_and_absent',
    presentListMeaning: 'opening',
    attendanceChangeAnchors: ['agenda_item'],
    statesPerDecisionAttendance: false,
    statesPerVoteAbsence: false,
    usesSubstitutes: false,
    namedVoters: 'dissenters_only',
    mayorStatedSeparately: true,
    provenance: { source: 'profile', profiledAt: '2026-09-13T00:00:00.000Z', documentsSampled: 40 },
};

function renderFields(value: DecisionConventions | null, onChange = jest.fn(), onConfirm = jest.fn(), confirming = false) {
    render(<DecisionConventionsFields value={value} onChange={onChange} onConfirm={onConfirm} confirming={confirming} />);
    return { onChange, onConfirm };
}

describe('DecisionConventionsFields', () => {
    it('renders nothing for a body nobody profiled', () => {
        const { container } = render(
            <DecisionConventionsFields value={null} onChange={() => {}} onConfirm={() => {}} confirming={false} />,
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('says the profile it is showing, with the day and the sample size', () => {
        renderFields(PROFILED);
        expect(screen.getByText('provenance.profile{"n":40,"date":"2026-09-13"}')).toBeInTheDocument();
        expect(screen.queryByText('form.confirmed')).not.toBeInTheDocument();
    });

    it('says who confirmed it once a person has', () => {
        renderFields({ ...PROFILED, provenance: { source: 'manual', confirmedBy: 'user-1', confirmedAt: '2026-09-17T08:30:00.000Z' } });
        expect(screen.getByText('provenance.manual{"who":"user-1","date":"2026-09-17"}')).toBeInTheDocument();
        expect(screen.getByText('form.confirmed')).toBeInTheDocument();
    });

    it('describes the value each single-choice field currently holds', () => {
        renderFields(PROFILED);
        expect(screen.getByText('rollCallLayout.present_and_absent.description')).toBeInTheDocument();
        expect(screen.getByText('presentListMeaning.opening.description')).toBeInTheDocument();
        expect(screen.getByText('namedVoters.dissenters_only.description')).toBeInTheDocument();
    });

    it('ticks only the anchors the conventions hold, and normalises the legacy names', () => {
        renderFields({ ...PROFILED, attendanceChangeAnchors: ['session_phase' as never] });
        expect(screen.getByLabelText('attendanceChangeAnchors.phase.label')).toBeChecked();
        expect(screen.getByLabelText('attendanceChangeAnchors.agenda_item.label')).not.toBeChecked();
    });

    it('adds an anchor to the set when its box is ticked', () => {
        const { onChange } = renderFields(PROFILED);
        fireEvent.click(screen.getByLabelText('attendanceChangeAnchors.decision_number.label'));
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
            attendanceChangeAnchors: ['agenda_item', 'decision_number'],
        }));
    });

    it('drops an anchor from the set when its box is unticked', () => {
        const { onChange } = renderFields(PROFILED);
        fireEvent.click(screen.getByLabelText('attendanceChangeAnchors.agenda_item.label'));
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ attendanceChangeAnchors: [] }));
    });

    it('flips a flag when its switch is toggled', () => {
        const { onChange } = renderFields(PROFILED);
        fireEvent.click(screen.getByLabelText('statesPerDecisionAttendance.label'));
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ statesPerDecisionAttendance: true }));
    });

    it('edits the notes', () => {
        const { onChange } = renderFields(PROFILED);
        fireEvent.change(screen.getByLabelText('form.notes'), { target: { value: 'ΤΑ ΜΕΛΗ at the end' } });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ notes: 'ΤΑ ΜΕΛΗ at the end' }));
    });

    it('confirms on the Confirm button, and refuses a second click while the write is in flight', () => {
        const { onConfirm } = renderFields(PROFILED);
        fireEvent.click(screen.getByRole('button', { name: 'form.confirm' }));
        expect(onConfirm).toHaveBeenCalledTimes(1);

        const confirming = jest.fn();
        render(<DecisionConventionsFields value={PROFILED} onChange={() => {}} onConfirm={confirming} confirming />);
        const buttons = screen.getAllByRole('button', { name: 'form.confirm' });
        expect(buttons[buttons.length - 1]).toBeDisabled();
    });
});

/** Profiling is what an unprofiled body has instead of fields to confirm. */
describe('DecisionConventionsFields profiling', () => {
    it('offers profiling, and nothing else, for a body nobody profiled', () => {
        const onProfile = jest.fn();
        render(<DecisionConventionsFields value={null} onChange={() => {}} onConfirm={() => {}} confirming={false} onProfile={onProfile} />);

        fireEvent.click(screen.getByRole('button', { name: 'form.profile' }));
        expect(onProfile).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', { name: 'form.confirm' })).not.toBeInTheDocument();
    });

    it('offers re-profiling beside the fields of a body already profiled', () => {
        const onProfile = jest.fn();
        render(<DecisionConventionsFields value={PROFILED} onChange={() => {}} onConfirm={() => {}} confirming={false} onProfile={onProfile} />);

        fireEvent.click(screen.getByRole('button', { name: 'form.profile' }));
        expect(onProfile).toHaveBeenCalledTimes(1);
    });

    it('refuses a second start while the task is running', () => {
        render(<DecisionConventionsFields value={PROFILED} onChange={() => {}} onConfirm={() => {}} confirming={false} onProfile={jest.fn()} profiling />);
        expect(screen.getByRole('button', { name: 'form.profile' })).toBeDisabled();
    });
});

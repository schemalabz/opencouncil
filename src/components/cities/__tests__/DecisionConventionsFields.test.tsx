import { render, screen, fireEvent } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import DecisionConventionsFields, { completeDraft, type ConventionsDraft } from '../DecisionConventionsFields';
import { parseDecisionConventions, type DecisionConventions } from '@/lib/decisionConventions';

// Radix Select asks the trigger about pointer capture on open; jsdom has none.
beforeAll(() => {
    Element.prototype.hasPointerCapture = jest.fn(() => false);
    Element.prototype.releasePointerCapture = jest.fn();
});

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
        expect(onConfirm).toHaveBeenCalledWith(PROFILED);

        const confirming = jest.fn();
        render(<DecisionConventionsFields value={PROFILED} onChange={() => {}} onConfirm={confirming} confirming />);
        const buttons = screen.getAllByRole('button', { name: 'form.confirm' });
        expect(buttons[buttons.length - 1]).toBeDisabled();
    });
});

/** A body with no record gets an empty one to fill, which the confirm path stores. */
describe('DecisionConventionsFields for a body with no record', () => {
    it('offers to start a record, and nothing to confirm yet', () => {
        renderFields(null);
        expect(screen.getByText('form.none')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'form.start' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'form.confirm' })).not.toBeInTheDocument();
    });

    it('shows an empty record once started, and will not confirm it before every choice is made', () => {
        const { onChange, onConfirm } = renderFields(null);
        fireEvent.click(screen.getByRole('button', { name: 'form.start' }));

        expect(screen.getByText('form.draft')).toBeInTheDocument();
        expect(screen.getAllByText('form.choose')).toHaveLength(3);
        expect(screen.getByLabelText('attendanceChangeAnchors.agenda_item.label')).not.toBeChecked();
        expect(screen.getByLabelText('statesPerDecisionAttendance.label')).not.toBeChecked();

        // Edits stay in the draft: the caller's form holds only a whole record.
        fireEvent.click(screen.getByLabelText('statesPerVoteAbsence.label'));
        expect(screen.getByLabelText('statesPerVoteAbsence.label')).toBeChecked();
        expect(onChange).not.toHaveBeenCalled();

        const confirm = screen.getByRole('button', { name: 'form.confirm' });
        expect(confirm).toBeDisabled();
        fireEvent.click(confirm);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('confirms the filled record, as the person stated it', async () => {
        // No timer between events and no pointer-events walk per click: under a
        // loaded parallel run, the defaults push this test past the 5 s limit.
        const user = userEvent.setup({ delay: null, pointerEventsCheck: PointerEventsCheckLevel.Never });
        const { onConfirm } = renderFields(null);
        await user.click(screen.getByRole('button', { name: 'form.start' }));

        const choose = async (field: string, option: string) => {
            await user.click(screen.getByLabelText(`${field}.fieldLabel`));
            await user.click(await screen.findByRole('option', { name: `${field}.${option}.label` }));
        };
        await choose('rollCallLayout', 'present_only');
        await choose('presentListMeaning', 'opening');
        expect(screen.getByRole('button', { name: 'form.confirm' })).toBeDisabled();
        await choose('namedVoters', 'dissenters_only');
        await user.click(screen.getByLabelText('attendanceChangeAnchors.agenda_item.label'));

        await user.click(screen.getByRole('button', { name: 'form.confirm' }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
        const record = onConfirm.mock.calls[0][0] as DecisionConventions;
        expect(record).toMatchObject({
            rollCallLayout: 'present_only',
            presentListMeaning: 'opening',
            namedVoters: 'dissenters_only',
            attendanceChangeAnchors: ['agenda_item'],
            statesPerDecisionAttendance: false,
            provenance: { source: 'manual' },
        });
        expect(parseDecisionConventions(record)).not.toBeNull();
    });
});

describe('completeDraft', () => {
    const draft: ConventionsDraft = {
        version: 1,
        attendanceChangeAnchors: [],
        statesPerDecisionAttendance: false,
        statesPerVoteAbsence: false,
        usesSubstitutes: false,
        mayorStatedSeparately: false,
        provenance: { source: 'manual' },
    };

    it('is no record while a single-choice field is unset', () => {
        expect(completeDraft(draft)).toBeNull();
        expect(completeDraft({ ...draft, rollCallLayout: 'mixed', presentListMeaning: 'unknown' })).toBeNull();
    });

    it('is a record the schema accepts once each is set', () => {
        const record = completeDraft({ ...draft, rollCallLayout: 'mixed', presentListMeaning: 'unknown', namedVoters: 'none' });
        expect(record).toEqual({ ...draft, rollCallLayout: 'mixed', presentListMeaning: 'unknown', namedVoters: 'none' });
    });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { DecisionsRail } from '../DecisionsRail';
import type { ConventionsPanel } from '../ConventionsSection';
import { buildTimeline } from '../../timeline';
import type { MinutesData, MinutesMember } from '@/lib/minutes/types';
import type { DecisionConventions } from '@/lib/decisionConventions';

jest.mock('@/i18n/routing', () => ({
    // `prefetch` is a Link prop, not a DOM attribute; React warns if it reaches an <a>.
    Link: ({ children, prefetch, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
        <a {...props}>{children}</a>
    ),
}));

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, params?: Record<string, unknown>) => {
        // The key 'adminOnly' resolves to its real Greek text, whichever
        // namespace calls it — the mock cannot tell the shared `Common.adminOnly`
        // key apart from a same-named rail-local key, only the key string
        // itself. Every other key stays literal, which is all the other
        // assertions need.
        if (key === 'adminOnly') return 'Μόνο για διαχειριστές';
        return params ? `${key}${JSON.stringify(params)}` : key;
    },
    useLocale: () => 'el',
}));

const member = (id: string): MinutesMember => ({ personId: id, name: id, party: null, isPartyHead: false, role: null });
const members = (n: number, prefix: string): MinutesMember[] => Array.from({ length: n }, (_, i) => member(`${prefix}${i}`));

function data(o: Partial<MinutesData>): MinutesData {
    return {
        city: { name: 'Δ', name_municipality: 'Δ', timezone: 'Europe/Athens', logoImage: null, realm: 'greece' },
        meeting: { id: 'm', cityId: 'c', name: 'Σ', dateTime: '2026-06-15T18:00:00.000Z' },
        administrativeBody: null, councilComposition: null, absentMembers: null, preambleEntries: [],
        attendanceChanges: [], attendanceChangesSource: 'diff', discussionOrderLabel: null, proceduralVotes: [], subjects: [], epilogueEntries: [], ...o,
    };
}

const minutes = data({
    councilComposition: { mayor: null, president: null, members: members(30, 'm'), substituteMembers: [] },
    absentMembers: members(3, 'abs'),
});

const basePollingProps = {
    isPolling: false,
    onPollSkippingCache: jest.fn(),
};

const rules: DecisionConventions = {
    version: 1,
    rollCallLayout: 'present_and_absent',
    presentListMeaning: 'opening',
    attendanceChangeAnchors: ['agenda_item'],
    statesPerDecisionAttendance: true,
    statesPerVoteAbsence: false,
    usesSubstitutes: false,
    namedVoters: 'dissenters_only',
    mayorStatedSeparately: true,
    provenance: { source: 'profile', documentsSampled: 8 },
};

const conventions: ConventionsPanel = {
    rules,
    bodyName: 'Δημοτική Επιτροπή',
    cityName: 'Δήμος Παπάγου-Χολαργού',
    editHref: '/chalandri',
};

function renderRail(overrides: Partial<React.ComponentProps<typeof DecisionsRail>> = {}) {
    return render(
        <DecisionsRail
            minutes={minutes}
            timeline={buildTimeline(minutes)}
            isSuperAdmin={false}
            auditMode={false}
            onAuditModeChange={jest.fn()}
            conventions={null}
            onPreviewMinutes={jest.fn()}
            onExportDocx={jest.fn()}
            previewDisabled={false}
            showResetExtractions={false}
            isClearing={false}
            onResetExtractions={jest.fn()}
            issues={[]}
            subjectName={() => undefined}
            onRederive={jest.fn()}
            isRederiving={false}
            {...basePollingProps}
            {...overrides}
        />
    );
}

describe('DecisionsRail', () => {
    it('renders the presence, attendance-changes, discussion-order and minutes cards for everyone', () => {
        renderRail();
        expect(screen.getByText('attendance')).toBeInTheDocument();
        expect(screen.getByText('factsArrivalsDepartures')).toBeInTheDocument();
        expect(screen.getByText('factsDiscussionOrder')).toBeInTheDocument();
        expect(screen.getByText('previewMinutes')).toBeInTheDocument();
    });

    it('puts the minutes card first, above the facts it is built from', () => {
        const { container } = renderRail();
        const titles = [...container.querySelectorAll('.text-\\[11px\\].font-extrabold')].map(el => el.textContent);
        expect(titles).toEqual(['rail.minutesTitle', 'attendance', 'factsArrivalsDepartures', 'factsDiscussionOrder', 'issues.title']);
    });

    it('renders no reset strip for a non-superadmin', () => {
        renderRail({ isSuperAdmin: false, showResetExtractions: true });
        expect(screen.queryByText('resetExtractions')).not.toBeInTheDocument();
    });

    it('renders no reset strip when showResetExtractions is false, even for a superadmin', () => {
        renderRail({ isSuperAdmin: true, showResetExtractions: false });
        expect(screen.queryByText('resetExtractions')).not.toBeInTheDocument();
    });

    it('renders the destructive reset strip for a superadmin when eligible', () => {
        renderRail({ isSuperAdmin: true, showResetExtractions: true });
        expect(screen.getByText('resetExtractions')).toBeInTheDocument();
        expect(screen.getByText('resetExtractionsDescription')).toBeInTheDocument();
    });

    it('calls onResetExtractions when the reset button is clicked', () => {
        const onResetExtractions = jest.fn();
        renderRail({ isSuperAdmin: true, showResetExtractions: true, onResetExtractions });
        fireEvent.click(screen.getByText('resetExtractions'));
        expect(onResetExtractions).toHaveBeenCalledTimes(1);
    });

    it('offers a superadmin the cache-bypassing poll, and never the ordinary re-check', () => {
        // The ordinary «Έλεγχος στη Διαύγεια τώρα» belongs to every admin and
        // sits on the questions card; a second copy here would be the same
        // request behind a staff-only frame.
        const onPollSkippingCache = jest.fn();
        renderRail({ isSuperAdmin: true, onPollSkippingCache });
        fireEvent.click(screen.getByText('pollButtonSkipCache'));
        expect(onPollSkippingCache).toHaveBeenCalledTimes(1);
        expect(screen.getByText('skipCacheHint')).toBeInTheDocument();
    });

    it('disables the poll while one is on its way', () => {
        renderRail({ isSuperAdmin: true, isPolling: true });
        expect(screen.getByText('pollButtonSkipCache').closest('button')).toBeDisabled();
    });

    it('frames the staff block once, with one label', () => {
        // The block wore the AdminOnly stripes and then striped each control
        // row inside them again: one warning about one thing, not two.
        renderRail({ isSuperAdmin: true, showResetExtractions: true });
        expect(screen.getAllByText('Μόνο για διαχειριστές')).toHaveLength(1);
        const frame = screen.getByText('Μόνο για διαχειριστές').parentElement as HTMLElement;
        expect(frame.querySelectorAll('[style*="repeating-linear-gradient"]')).toHaveLength(0);
    });

    it('prints the control hints on a solid surface rather than on the stripes', () => {
        renderRail({ isSuperAdmin: true, showResetExtractions: true });
        expect(screen.getByText('skipCacheHint').closest('.bg-background')).toBeInTheDocument();
        expect(screen.getByText('resetExtractionsDescription').closest('.bg-background')).toBeInTheDocument();
    });

    it('summarises the body\'s reading rules on one line, collapsed', () => {
        renderRail({ isSuperAdmin: true, conventions });
        expect(screen.getByText('conventionsTitle')).toBeInTheDocument();
        // The rules belong to the body; the page is one meeting of it.
        expect(screen.getByText('Δημοτική Επιτροπή · Δήμος Παπάγου-Χολαργού')).toBeInTheDocument();
        expect(screen.getByText(
            'rollCallLayout.present_and_absent.label · presentListMeaning.opening.label · attendanceChangeAnchors.agenda_item.label · namedVoters.dissenters_only.label'
        )).toBeInTheDocument();
        expect(screen.queryByText('rollCallLayout.fieldLabel')).not.toBeInTheDocument();
        expect(screen.queryByText('statesPerDecisionAttendance.label')).not.toBeInTheDocument();
    });

    it('opens to all eight fields, with the flags as ✓/✗ and a link to the form', () => {
        const { container } = renderRail({ isSuperAdmin: true, conventions });
        fireEvent.click(screen.getByText('conventionsTitle'));

        for (const field of ['rollCallLayout', 'presentListMeaning', 'attendanceChangeAnchors', 'namedVoters']) {
            expect(screen.getByText(`${field}.fieldLabel`)).toBeInTheDocument();
        }
        for (const flag of ['statesPerDecisionAttendance', 'statesPerVoteAbsence', 'usesSubstitutes', 'mayorStatedSeparately']) {
            expect(screen.getByText(`${flag}.label`)).toBeInTheDocument();
        }
        expect(screen.getAllByText('✓')).toHaveLength(2);
        expect(screen.getAllByText('✗')).toHaveLength(2);
        expect(container.querySelector('.rotate-180')).toBeInTheDocument();
        expect(screen.getByText('conventionsEdit →').closest('a')).toHaveAttribute('href', '/chalandri');
    });

    it('reveals a value\'s description as text rather than a tooltip', () => {
        renderRail({ isSuperAdmin: true, conventions });
        fireEvent.click(screen.getByText('conventionsTitle'));
        expect(screen.queryByText('namedVoters.dissenters_only.description')).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('namedVoters.dissenters_only.label'));
        expect(screen.getByText('namedVoters.dissenters_only.description')).toBeInTheDocument();
    });

    it('says a body has no stored rules rather than hiding the section', () => {
        renderRail({ isSuperAdmin: true, conventions: { ...conventions, rules: null } });
        expect(screen.getByText('conventionsNone')).toBeInTheDocument();
        expect(screen.getByText('conventionsEdit →').closest('a')).toHaveAttribute('href', '/chalandri');
    });

    it('shows no rules section when the meeting names no administrative body', () => {
        renderRail({ isSuperAdmin: true, conventions: null });
        expect(screen.queryByText('conventionsTitle')).not.toBeInTheDocument();
    });

    it('shows a city admin no staff block at all', () => {
        renderRail({ isSuperAdmin: false, showResetExtractions: true, conventions });
        expect(screen.queryByText('Μόνο για διαχειριστές')).not.toBeInTheDocument();
        expect(screen.queryByText('conventionsTitle')).not.toBeInTheDocument();
        expect(screen.queryByText('pollButtonSkipCache')).not.toBeInTheDocument();
        expect(screen.queryByText('resetExtractions')).not.toBeInTheDocument();
    });
});

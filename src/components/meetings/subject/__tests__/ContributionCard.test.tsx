import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ContributionCard } from '../ContributionCard';

jest.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }));
let mockUtteranceInfo: { startTimestamp: number; endTimestamp: number } | undefined;
jest.mock('swr', () => ({ __esModule: true, default: () => ({ data: mockUtteranceInfo }) }));
jest.mock('@/lib/analytics/capture', () => ({ captureEvent: jest.fn() }));
jest.mock('@/components/meetings/bar/BarHighlightContext', () => ({ useContributionBarHover: () => ({}), useSpeakerBarHover: () => ({}) }));
jest.mock('@/components/FormattedTextDisplay', () => ({ FormattedTextDisplay: ({ text }: { text: string }) => <p>{text}</p> }));
jest.mock('@/components/meetings/PlayPauseButton', () => ({ PlayPauseButton: ({ children }: { children: React.ReactNode }) => <button aria-label="playContribution">{children}</button> }));
jest.mock('@/components/icon', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/ImageOrInitials', () => ({ ImageOrInitials: () => null }));
jest.mock('@/i18n/routing', () => ({ Link: ({ children, href, title, 'aria-label': label }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} title={title} aria-label={label}>{children}</a> }));

const contribution = { id: 'contribution1', text: 'Summary of the contribution.', speakerId: null, speakerName: null };
const props = { contribution, subjectId: 'subject1', meeting: { id: 'meeting1', cityId: 'city1', released: true }, speaker: null };

const writeText = jest.fn().mockResolvedValue(undefined);
describe('contribution sharing entry points', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUtteranceInfo = undefined;
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
        HTMLElement.prototype.scrollIntoView = jest.fn();
    });
    it('shares an unidentified speaker without a playback timestamp', async () => {
        render(<ContributionCard {...props} />);
        const share = screen.getByRole('button', { name: 'shareContribution' });
        expect(share.closest('header')).not.toBeNull();
        expect(share).toHaveAttribute('title', 'shareContribution');
        expect(share.textContent).toBe('');
        fireEvent.click(share);
        fireEvent.click(screen.getByRole('button', { name: 'copyLink' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://localhost/en/city1/meeting1/subjects/subject1?contribution=contribution1#contribution-contribution1'));
        expect(screen.getByText('summary')).toBeInTheDocument();
    });
    it('shares the same contribution from a person page without video context', async () => {
        mockUtteranceInfo = { startTimestamp: 0, endTimestamp: 30 };
        render(<ContributionCard {...props} showPlayButton={false} showSpeaker={false} sourcePage="person" contextHeader={{ meetingName: 'Meeting', adminBodyName: null, meetingDate: new Date('2026-09-10'), subjectName: 'A subject', topic: null }} />);
        expect(screen.queryByRole('button', { name: 'playContribution' })).not.toBeInTheDocument();
        const share = screen.getByRole('button', { name: 'shareContribution' });
        expect(share.closest('header')).not.toBeNull();
        fireEvent.click(share);
        fireEvent.click(screen.getByRole('button', { name: 'copyLink' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://localhost/en/city1/meeting1/subjects/subject1?contribution=contribution1#contribution-contribution1'));
    });
    it('keeps sharing and both playback actions together in the subject header', () => {
        mockUtteranceInfo = { startTimestamp: 0, endTimestamp: 30 };
        const { container } = render(<ContributionCard {...props} contribution={{ ...contribution, speakerId: 'speaker1' }} />);
        const header = within(container.querySelector('header')!);
        expect(header.getByRole('button', { name: 'shareContribution' })).toBeInTheDocument();
        expect(header.getByRole('button', { name: 'playContribution' })).toBeInTheDocument();
        expect(header.getByRole('link', { name: 'transcript' })).toHaveAttribute('href', '/city1/meeting1/transcript?t=0');
        expect(screen.getAllByRole('button', { name: 'shareContribution' })).toHaveLength(1);
    });
    it('does not offer public sharing for a draft meeting and retains a stable anchor', () => {
        const { container } = render(<ContributionCard {...props} meeting={{ ...props.meeting, released: false }} />);
        expect(screen.queryByRole('button', { name: 'shareContribution' })).not.toBeInTheDocument();
        expect(container.querySelector('#contribution-contribution1')).not.toBeNull();
    });
    it('marks and scrolls only the selected contribution without starting playback', () => {
        const { container } = render(<ContributionCard {...props} highlighted />);
        expect(container.querySelector('[data-shared-contribution="true"]')).not.toBeNull();
        expect(screen.getByText('sharedContribution')).toBeInTheDocument();
        expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' });
    });

});

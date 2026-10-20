import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SubjectCard } from '../SubjectCard';
import type { LandingSubject } from '@/lib/landing/landingData';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'el' }));
jest.mock('@/i18n/routing', () => ({
    Link: ({ href, children, prefetch: _prefetch, ...props }: { href: string; children: ReactNode; prefetch?: boolean } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a href={href} {...props}>{children}</a>
    ),
    getPathname: ({ href }: { href: string }) => href,
}));
jest.mock('@/lib/analytics/capture', () => ({ captureMapAction: jest.fn() }));
jest.mock('@/components/icon', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/subject/SubjectImage', () => ({ SubjectImage: () => <span data-testid="subject-image" /> }));

// Radix positions the popover with a ResizeObserver, which jsdom does not have.
class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
beforeAll(() => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
});

const subject: LandingSubject = {
    id: 's1',
    title: 'Άδεια μουσικών παραστάσεων',
    descriptionPreview: 'Αίτημα της εταιρείας για χορήγηση άδειας.',
    descriptionTruncated: false,
    cityId: 'samothraki',
    cityName: 'Σαμοθράκη',
    nameMunicipality: 'Δήμος Σαμοθράκης',
    cityLogo: null,
    meetingId: 'm1',
    lat: 40.5,
    lng: 25.5,
    date: '2026-08-30T08:00:00.000Z',
    cityTimezone: 'Europe/Athens',
    where: 'Κοφκή Καμαριώτισσας',
    bodyName: 'Δημοτικό Συμβούλιο',
    adminBodyType: 'council',
    topicId: 't1',
    topic: { name: 'Εμπόριο', color: '#4f46e5', icon: 'store' },
    durationMin: 64,
    speakers: 9,
    hot: true,
    href: '/samothraki/m1/subjects/s1',
};

describe('SubjectCard', () => {
    it('marks the card as AI-made with one robot, not an image label', () => {
        render(<SubjectCard subject={subject} />);
        expect(screen.queryByText('subject.aiImage')).toBeNull();
        expect(screen.getByRole('button', { name: 'aiDisclosure.label' })).toBeInTheDocument();
    });

    it('opens the explanation without selecting the card', () => {
        const onClick = jest.fn();
        render(<SubjectCard subject={subject} onClick={onClick} />);
        fireEvent.click(screen.getByRole('button', { name: 'aiDisclosure.label' }));
        expect(screen.getByRole('dialog')).toHaveTextContent('aiDisclosure.title');
        expect(screen.getByRole('link', { name: 'aiDisclosure.learnMore' })).toHaveAttribute('href', '/about#process');
        expect(onClick).not.toHaveBeenCalled();
    });
});

describe('SubjectCard description', () => {
    const truncated: LandingSubject = { ...subject, id: 's2', descriptionPreview: 'Η αρχή της περιγραφής…', descriptionTruncated: true };
    const full = 'Η αρχή της περιγραφής και όλη η συνέχειά της.';
    let fetchMock: jest.Mock;
    beforeEach(() => {
        fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ description: full }) });
        (globalThis as { fetch?: unknown }).fetch = fetchMock;
    });
    afterEach(() => {
        delete (globalThis as { fetch?: unknown }).fetch;
    });

    it('shows the preview and asks for nothing while the card is not selected', () => {
        render(<SubjectCard subject={truncated} />);
        expect(screen.getByText('Η αρχή της περιγραφής…')).toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(screen.getByText('Η αρχή της περιγραφής…')).not.toHaveAttribute('aria-busy');
    });

    it('fetches the full description once selected and shows it when it lands', async () => {
        render(<SubjectCard subject={truncated} selected />);
        expect(fetchMock).toHaveBeenCalledWith('/api/subject/s2/description');
        // While the rest loads, the preview's "…" pulses and the paragraph is busy.
        const loading = screen.getByText((_, el) => el?.tagName === 'P' && el.textContent?.startsWith('Η αρχή της περιγραφής...') === true);
        expect(loading).toHaveAttribute('aria-busy', 'true');
        expect(loading).toHaveTextContent('subject.loadingDescription');
        await act(async () => {});
        const done = screen.getByText(full);
        expect(done).not.toHaveAttribute('aria-busy');
        expect(screen.queryByText('subject.loadingDescription')).not.toBeInTheDocument();
    });

    it('does not fetch for a description that is already whole', () => {
        render(<SubjectCard subject={subject} selected />);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('shares one request between two cards of the same subject', async () => {
        const twice: LandingSubject = { ...truncated, id: 's3' };
        render(
            <>
                <SubjectCard subject={twice} selected />
                <SubjectCard subject={twice} selected />
            </>,
        );
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await act(async () => {});
        expect(screen.getAllByText(full)).toHaveLength(2);
    });

    it('keeps an answer that lands after the card was deselected', async () => {
        const later: LandingSubject = { ...truncated, id: 's4' };
        let resolve: (value: { ok: boolean; json: () => Promise<{ description: string }> }) => void = () => {};
        fetchMock.mockReturnValue(new Promise((r) => { resolve = r; }));
        const { unmount } = render(<SubjectCard subject={later} selected />);
        unmount();
        await act(async () => { resolve({ ok: true, json: async () => ({ description: full }) }); });

        render(<SubjectCard subject={later} selected />);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(screen.getByText(full)).toBeInTheDocument();
    });
});

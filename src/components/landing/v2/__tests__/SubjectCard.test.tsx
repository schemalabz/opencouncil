import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { SubjectCard } from '@/components/landing/v2/SubjectCard';
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
    summary: 'Αίτημα της εταιρείας για χορήγηση άδειας.',
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
        expect(screen.getByRole('link', { name: 'aiDisclosure.learnMore' })).toHaveAttribute('href', '/about#how-it-works');
        expect(onClick).not.toHaveBeenCalled();
    });
});

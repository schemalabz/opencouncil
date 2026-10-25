import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { RelativeTime } from '@/components/RelativeTime';

const NOW = new Date('2026-10-20T10:00:00Z');

function renderIn(locale: string, date: Date) {
    return render(
        <NextIntlClientProvider locale={locale} messages={{}}>
            <RelativeTime date={date} />
        </NextIntlClientProvider>,
    );
}

beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
});

afterEach(() => {
    jest.useRealTimers();
});

describe('RelativeTime', () => {
    it('renders the distance in the active locale', () => {
        const fiveMinutesAgo = new Date(NOW.getTime() - 5 * 60_000);

        renderIn('el', fiveMinutesAgo);
        expect(screen.getByText('5 λεπτά πριν')).toBeInTheDocument();
    });

    it('renders English text for the en locale', () => {
        const fiveMinutesAgo = new Date(NOW.getTime() - 5 * 60_000);

        renderIn('en', fiveMinutesAgo);
        expect(screen.getByText('5 minutes ago')).toBeInTheDocument();
    });

    it('refreshes the text every minute from the clock', () => {
        renderIn('el', new Date(NOW.getTime() - 2 * 60_000));
        expect(screen.getByText('2 λεπτά πριν')).toBeInTheDocument();

        act(() => {
            jest.advanceTimersByTime(60_000);
        });
        expect(screen.getByText('3 λεπτά πριν')).toBeInTheDocument();
    });
});

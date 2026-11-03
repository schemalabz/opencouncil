import React from 'react';
import { render, screen } from '@testing-library/react';
import { AdminSection } from '@/components/profile/AdminSection';

jest.mock('@/i18n/routing', () => ({
    Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const t = (key: string) => key;
const roleLabel = (role: string) => `role:${role}`;
const kindLabel = (kind: string) => `kind:${kind}`;

const now = new Date('2026-11-03T10:00:00Z');
const grant = (overrides: Partial<React.ComponentProps<typeof AdminSection>['user']['administers'][number]>) => ({
    id: 'g1',
    role: 'admin' as const,
    createdAt: now,
    acceptedAt: now,
    revokedAt: null,
    ...overrides,
});

describe('AdminSection', () => {
    it('names a body with its city, since many cities have a body of the same name', () => {
        render(
            <AdminSection
                user={{
                    isSuperAdmin: false,
                    administers: [grant({ administrativeBody: { id: 'b1', cityId: 'argithea', name: 'Δημοτική Επιτροπή', city: { name: 'Αργιθέα' } } })],
                }}
                t={t}
                roleLabel={roleLabel}
                kindLabel={kindLabel}
            />,
        );
        expect(screen.getByText('Δημοτική Επιτροπή, Αργιθέα')).toBeInTheDocument();
        expect(screen.getByText('kind:body · role:admin')).toBeInTheDocument();
        expect(screen.getByRole('link')).toHaveAttribute('href', '/argithea/meetings');
    });

    it('names a city by its name alone', () => {
        render(
            <AdminSection
                user={{ isSuperAdmin: false, administers: [grant({ role: 'records', city: { id: 'argithea', name: 'Αργιθέα' } })] }}
                t={t}
                roleLabel={roleLabel}
                kindLabel={kindLabel}
            />,
        );
        expect(screen.getByText('Αργιθέα')).toBeInTheDocument();
        expect(screen.getByText('kind:city · role:records')).toBeInTheDocument();
    });

    it('shows no row for a pending invite, and nothing at all without a right', () => {
        const { container } = render(
            <AdminSection
                user={{ isSuperAdmin: false, administers: [grant({ acceptedAt: null, city: { id: 'argithea', name: 'Αργιθέα' } })] }}
                t={t}
                roleLabel={roleLabel}
                kindLabel={kindLabel}
            />,
        );
        expect(container).toBeEmptyDOMElement();
    });
});

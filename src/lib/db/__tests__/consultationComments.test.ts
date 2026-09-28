import { ConsultationCommentEntityType } from '@prisma/client';

jest.mock('@/lib/db/prisma', () => {
    const client = {
        pendingConsultationComment: { findUnique: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
        consultationComment: { create: jest.fn() },
        user: { updateMany: jest.fn(), findUnique: jest.fn() },
        $transaction: jest.fn(),
    };
    // An interactive transaction runs its callback against the same (mocked) client.
    client.$transaction.mockImplementation((callback: (tx: typeof client) => unknown) => callback(client));
    return { __esModule: true, default: client };
});
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_URL: 'http://localhost:3000' } }));
jest.mock('@/lib/email/consultation', () => ({ sendConsultationCommentEmail: jest.fn() }));
jest.mock('@/lib/utils/realmBaseUrl', () => ({ realmBaseUrl: () => 'https://opencouncil.gr' }));

import prisma from '@/lib/db/prisma';
import { sendConsultationCommentEmail } from '@/lib/email/consultation';
import { confirmPendingConsultationComment, PENDING_COMMENT_MAX_AGE_MS, pendingCommentQuote } from '../consultationComments';

const db = prisma as unknown as {
    pendingConsultationComment: { findUnique: jest.Mock; deleteMany: jest.Mock };
    consultationComment: { create: jest.Mock };
    user: { updateMany: jest.Mock; findUnique: jest.Mock };
};
const sendEmail = sendConsultationCommentEmail as jest.Mock;

const regulation = {
    title: 'ΣΕΣ',
    contactEmail: 'dimos@example.org',
    sources: [],
    regulation: [{ type: 'geoset', id: 'residents', name: 'Θέσεις κατοίκων', geometries: [{ type: 'polygon', id: 'res-1', name: 'Βουτσινά, δεξιά πλευρά', geojson: { type: 'Polygon', coordinates: [] } }] }],
};

const now = new Date('2026-10-01T12:00:00Z');
const consultation = { id: 'ses', cityId: 'papagos', jsonUrl: 'https://example.org/ses.json', isActive: true, city: { realm: 'greece' } };

function pendingRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 'p1',
        userId: 'u1',
        body: '<p>Λίγες θέσεις</p>',
        entityType: ConsultationCommentEntityType.GEOMETRY,
        entityId: 'res-1',
        authorName: 'Μαρία',
        createdAt: new Date(now.getTime() - 60_000),
        consultation,
        ...overrides,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    db.pendingConsultationComment.deleteMany.mockResolvedValue({ count: 1 });
    db.consultationComment.create.mockImplementation(({ data }) => Promise.resolve({ id: 'c1', ...data }));
    db.user.findUnique.mockResolvedValue({ name: 'Μαρία', email: 'maria@example.org' });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(regulation) }) as unknown as typeof fetch;
});

describe('confirmPendingConsultationComment', () => {
    it('publishes the comment with its submission time and emails the municipality', async () => {
        const row = pendingRow();
        db.pendingConsultationComment.findUnique.mockResolvedValue(row);

        await expect(confirmPendingConsultationComment('p1', 'u1', now)).resolves.toBe('published');

        expect(db.pendingConsultationComment.deleteMany).toHaveBeenCalledWith({ where: { id: 'p1' } });
        expect(db.consultationComment.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ body: '<p>Λίγες θέσεις</p>', entityId: 'res-1', userId: 'u1', consultationId: 'ses', cityId: 'papagos', createdAt: row.createdAt }),
        });
        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
            municipalityEmail: 'dimos@example.org',
            entityLabel: 'Θέσεις κατοίκων · Βουτσινά, δεξιά πλευρά',
            consultationUrl: 'https://opencouncil.gr/papagos/consultation/ses',
        }));
    });

    it('does not publish a comment for anyone but its author', async () => {
        db.pendingConsultationComment.findUnique.mockResolvedValue(pendingRow({ userId: 'someone-else' }));

        await expect(confirmPendingConsultationComment('p1', 'u1', now)).resolves.toBe('not-found');
        expect(db.pendingConsultationComment.deleteMany).not.toHaveBeenCalled();
        expect(db.consultationComment.create).not.toHaveBeenCalled();
    });

    it('puts the typed name on an account that has none, before the email names the author', async () => {
        db.pendingConsultationComment.findUnique.mockResolvedValue(pendingRow());
        await confirmPendingConsultationComment('p1', 'u1', now);
        expect(db.user.updateMany).toHaveBeenCalledWith({
            where: { id: 'u1', OR: [{ name: null }, { name: '' }] },
            data: { name: 'Μαρία' },
        });
        expect(db.user.updateMany.mock.invocationCallOrder[0]).toBeLessThan(sendEmail.mock.invocationCallOrder[0]);
    });

    it('drops a comment whose link expired or whose consultation closed', async () => {
        db.pendingConsultationComment.findUnique.mockResolvedValueOnce(pendingRow({ createdAt: new Date(now.getTime() - PENDING_COMMENT_MAX_AGE_MS - 1) }));
        await expect(confirmPendingConsultationComment('p1', 'u1', now)).resolves.toBe('expired');
        db.pendingConsultationComment.findUnique.mockResolvedValueOnce(pendingRow({ consultation: { ...consultation, isActive: false } }));
        await expect(confirmPendingConsultationComment('p1', 'u1', now)).resolves.toBe('expired');

        expect(db.pendingConsultationComment.deleteMany).toHaveBeenCalledTimes(2);
        expect(db.consultationComment.create).not.toHaveBeenCalled();
        expect(db.user.updateMany).not.toHaveBeenCalled();
    });

    it('does not publish a comment another opening of the link already claimed', async () => {
        db.pendingConsultationComment.findUnique.mockResolvedValue(pendingRow());
        db.pendingConsultationComment.deleteMany.mockResolvedValue({ count: 0 });

        await expect(confirmPendingConsultationComment('p1', 'u1', now)).resolves.toBe('not-found');
        expect(db.consultationComment.create).not.toHaveBeenCalled();
    });

    it('drops a comment on a place the regulation no longer has', async () => {
        db.pendingConsultationComment.findUnique.mockResolvedValue(pendingRow({ entityId: 'gone' }));
        await expect(confirmPendingConsultationComment('p1', 'u1', now)).resolves.toBe('not-found');
        expect(db.consultationComment.create).not.toHaveBeenCalled();
    });

    it('keeps the comment pending when the regulation cannot be fetched', async () => {
        db.pendingConsultationComment.findUnique.mockResolvedValue(pendingRow());
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;

        await expect(confirmPendingConsultationComment('p1', 'u1', now)).resolves.toBe('unavailable');
        expect(db.pendingConsultationComment.deleteMany).not.toHaveBeenCalled();
        expect(db.consultationComment.create).not.toHaveBeenCalled();
    });

    it('claims the comment and stores it in one transaction', async () => {
        db.pendingConsultationComment.findUnique.mockResolvedValue(pendingRow());
        db.consultationComment.create.mockRejectedValue(new Error('insert failed'));

        await expect(confirmPendingConsultationComment('p1', 'u1', now)).rejects.toThrow('insert failed');
        const transaction = (prisma as unknown as { $transaction: jest.Mock }).$transaction;
        expect(transaction).toHaveBeenCalledTimes(1);
        expect(sendEmail).not.toHaveBeenCalled();
    });

    it('finds nothing for an unknown id', async () => {
        db.pendingConsultationComment.findUnique.mockResolvedValue(null);
        await expect(confirmPendingConsultationComment('nope', 'u1', now)).resolves.toBe('not-found');
        expect(global.fetch).not.toHaveBeenCalled();
    });
});

describe('pendingCommentQuote', () => {
    const link = (callbackUrl: string) => `https://opencouncil.gr/api/auth/callback/resend?callbackUrl=${encodeURIComponent(callbackUrl)}&token=t`;

    it('quotes the pending comment the link publishes, as the reader typed it', async () => {
        db.pendingConsultationComment.findUnique.mockResolvedValue({ body: '<p>Λίγες θέσεις<br>&amp; στενό</p>', user: { email: 'maria@example.org' } });
        await expect(pendingCommentQuote(link('/papagos/consultation/ses?view=comment&entity=res-1&pending=p1'), 'Maria@Example.org')).resolves.toBe('Λίγες θέσεις\n& στενό');
        expect(db.pendingConsultationComment.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1' } }));
    });

    it("never quotes another account's comment, or a link without one", async () => {
        db.pendingConsultationComment.findUnique.mockResolvedValue({ body: '<p>μυστικό</p>', user: { email: 'someone@example.org' } });
        await expect(pendingCommentQuote(link('/papagos/consultation/ses?view=comment&entity=res-1&pending=p1'), 'maria@example.org')).resolves.toBeNull();
        await expect(pendingCommentQuote(link('/profile'), 'maria@example.org')).resolves.toBeNull();
    });
});

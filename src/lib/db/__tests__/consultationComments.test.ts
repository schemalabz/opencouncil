import { ConsultationCommentEntityType } from '@prisma/client';

jest.mock('@/lib/db/prisma', () => {
    const client = {
        pendingConsultationComment: { findMany: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
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
import { PENDING_COMMENT_MAX_AGE_MS, publishPendingConsultationComments } from '../consultationComments';

const db = prisma as unknown as {
    pendingConsultationComment: { findMany: jest.Mock; deleteMany: jest.Mock };
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

describe('publishPendingConsultationComments', () => {
    it('publishes a fresh comment with its submission time and emails the municipality', async () => {
        const row = pendingRow();
        db.pendingConsultationComment.findMany.mockResolvedValue([row]);

        await expect(publishPendingConsultationComments('u1', now)).resolves.toBe(1);

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

    it('puts the typed name on an account that has none, before the email names the author', async () => {
        db.pendingConsultationComment.findMany.mockResolvedValue([pendingRow()]);
        await publishPendingConsultationComments('u1', now);
        expect(db.user.updateMany).toHaveBeenCalledWith({
            where: { id: 'u1', OR: [{ name: null }, { name: '' }] },
            data: { name: 'Μαρία' },
        });
        expect(db.user.updateMany.mock.invocationCallOrder[0]).toBeLessThan(sendEmail.mock.invocationCallOrder[0]);
    });

    it('drops a stale comment or one on a closed consultation without publishing it', async () => {
        db.pendingConsultationComment.findMany.mockResolvedValue([
            pendingRow({ id: 'old', createdAt: new Date(now.getTime() - PENDING_COMMENT_MAX_AGE_MS - 1) }),
            pendingRow({ id: 'closed', consultation: { ...consultation, isActive: false } }),
        ]);

        await expect(publishPendingConsultationComments('u1', now)).resolves.toBe(0);

        expect(db.pendingConsultationComment.deleteMany).toHaveBeenCalledTimes(2);
        expect(db.consultationComment.create).not.toHaveBeenCalled();
        expect(db.user.updateMany).not.toHaveBeenCalled();
    });

    it('does not publish a comment another sign-in already claimed', async () => {
        db.pendingConsultationComment.findMany.mockResolvedValue([pendingRow()]);
        db.pendingConsultationComment.deleteMany.mockResolvedValue({ count: 0 });

        await expect(publishPendingConsultationComments('u1', now)).resolves.toBe(0);
        expect(db.consultationComment.create).not.toHaveBeenCalled();
    });

    it('drops a comment on an entity the regulation no longer has', async () => {
        db.pendingConsultationComment.findMany.mockResolvedValue([pendingRow({ entityId: 'gone' })]);
        await expect(publishPendingConsultationComments('u1', now)).resolves.toBe(0);
        expect(db.consultationComment.create).not.toHaveBeenCalled();
    });

    it('keeps the comment pending when the regulation cannot be fetched', async () => {
        db.pendingConsultationComment.findMany.mockResolvedValue([pendingRow()]);
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;

        await expect(publishPendingConsultationComments('u1', now)).resolves.toBe(0);
        expect(db.pendingConsultationComment.deleteMany).not.toHaveBeenCalled();
        expect(db.consultationComment.create).not.toHaveBeenCalled();
    });

    it('claims the comment and stores it in one transaction', async () => {
        db.pendingConsultationComment.findMany.mockResolvedValue([pendingRow()]);
        db.consultationComment.create.mockRejectedValue(new Error('insert failed'));

        await expect(publishPendingConsultationComments('u1', now)).rejects.toThrow('insert failed');
        const transaction = (prisma as unknown as { $transaction: jest.Mock }).$transaction;
        expect(transaction).toHaveBeenCalledTimes(1);
        expect(sendEmail).not.toHaveBeenCalled();
    });

    it('does nothing for a reader without pending comments', async () => {
        db.pendingConsultationComment.findMany.mockResolvedValue([]);
        await expect(publishPendingConsultationComments('u1', now)).resolves.toBe(0);
        expect(global.fetch).not.toHaveBeenCalled();
    });
});

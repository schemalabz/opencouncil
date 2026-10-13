jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        consultationComment: { findUnique: jest.fn() },
        consultationCommentResponse: { create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
    },
}));
jest.mock('@/lib/auth', () => ({ getCurrentUser: jest.fn(), isUserAuthorizedToEdit: jest.fn() }));
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_URL: 'http://localhost:3000' } }));
jest.mock('@/lib/email/consultation', () => ({ sendConsultationCommentEmail: jest.fn() }));
jest.mock('@/lib/email/consultationResponse', () => ({ sendConsultationResponseEmail: jest.fn() }));
jest.mock('@/lib/utils/realmBaseUrl', () => ({ realmBaseUrl: () => 'https://opencouncil.gr' }));

import prisma from '@/lib/db/prisma';
import { getCurrentUser, isUserAuthorizedToEdit } from '@/lib/auth';
import { sendConsultationResponseEmail } from '@/lib/email/consultationResponse';
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from '@/lib/api/errors';
import { deleteConsultationCommentResponse, respondToConsultationComment } from '../consultationResponses';

const db = prisma as unknown as {
    consultationComment: { findUnique: jest.Mock };
    consultationCommentResponse: { create: jest.Mock; update: jest.Mock; deleteMany: jest.Mock };
};
const mockUser = getCurrentUser as jest.Mock;
const mockAuthorized = isUserAuthorizedToEdit as jest.Mock;
const mockSend = sendConsultationResponseEmail as jest.Mock;

const regulation = {
    title: 'ΣΕΣ',
    contactEmail: 'info@dpapxol.gov.gr',
    ccEmails: ['mayor@dpapxol.gov.gr'],
    sources: [],
    regulation: [{ type: 'geoset', id: 'residents', name: 'Θέσεις κατοίκων', geometries: [{ type: 'polygon', id: 'res-1', name: 'Βουτσινά, δεξιά πλευρά', geojson: { type: 'Polygon', coordinates: [] } }] }],
};

const admin = { id: 'admin-1', email: 'admin@dpapxol.gov.gr', administers: [] };

function comment(overrides: Record<string, unknown> = {}) {
    return {
        id: 'c1',
        body: '<p>Λίγες&nbsp;θέσεις.</p><p>Δεύτερη γραμμή.</p>',
        entityId: 'res-1',
        cityId: 'papagos-cholargos',
        consultationId: 'ses',
        user: { name: 'Μαρία', email: 'maria@example.org' },
        consultation: { id: 'ses', name: 'Σύστημα Ελεγχόμενης Στάθμευσης', jsonUrl: 'https://example.org/ses.json', city: { realm: 'greece', name_municipality: 'Δήμος Παπάγου - Χολαργού' } },
        response: null,
        ...overrides,
    };
}

const view = { body: '<p>Θα το δούμε.</p>', createdAt: new Date('2026-10-13T09:00:00Z'), updatedAt: new Date('2026-10-13T09:00:00Z') };

beforeEach(() => {
    jest.clearAllMocks();
    mockUser.mockResolvedValue(admin);
    mockAuthorized.mockResolvedValue(true);
    db.consultationComment.findUnique.mockResolvedValue(comment());
    db.consultationCommentResponse.create.mockResolvedValue(view);
    db.consultationCommentResponse.update.mockResolvedValue(view);
    db.consultationCommentResponse.deleteMany.mockResolvedValue({ count: 1 });
    mockSend.mockResolvedValue(true);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(regulation) }) as unknown as typeof fetch;
});

describe('respondToConsultationComment', () => {
    it('publishes the first response and emails the author with the municipality in CC', async () => {
        await expect(respondToConsultationComment('c1', 'Θα το δούμε.')).resolves.toEqual({ response: view, created: true, emailSent: true });

        expect(db.consultationCommentResponse.create).toHaveBeenCalledWith({
            data: { commentId: 'c1', body: '<p>Θα το δούμε.</p>', authorUserId: 'admin-1' },
            select: { body: true, createdAt: true, updatedAt: true },
        });
        expect(mockSend).toHaveBeenCalledWith({
            authorName: 'Μαρία',
            authorEmail: 'maria@example.org',
            adminEmail: 'admin@dpapxol.gov.gr',
            contactEmail: 'info@dpapxol.gov.gr',
            ccEmails: ['mayor@dpapxol.gov.gr'],
            municipalityName: 'Δήμος Παπάγου - Χολαργού',
            consultationTitle: 'ΣΕΣ',
            entityLabel: 'Θέσεις κατοίκων · Βουτσινά, δεξιά πλευρά',
            commentText: 'Λίγες θέσεις.\n\nΔεύτερη γραμμή.',
            responseText: 'Θα το δούμε.',
            commentUrl: 'https://opencouncil.gr/papagos-cholargos/consultation/ses?view=comment&entity=res-1',
            locale: 'el',
        });
        expect(db.consultationCommentResponse.update).toHaveBeenCalledWith({ where: { commentId: 'c1' }, data: { emailSentAt: expect.any(Date) } });
    });

    it('replaces an existing response without a second email', async () => {
        db.consultationComment.findUnique.mockResolvedValue(comment({ response: { id: 'r1', emailSentAt: new Date('2026-10-12T10:00:00Z') } }));

        await expect(respondToConsultationComment('c1', 'Διορθωμένο.')).resolves.toEqual({ response: view, created: false, emailSent: true });

        expect(db.consultationCommentResponse.create).not.toHaveBeenCalled();
        expect(db.consultationCommentResponse.update).toHaveBeenCalledTimes(1);
        expect(db.consultationCommentResponse.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'r1' }, data: { body: '<p>Διορθωμένο.</p>', authorUserId: 'admin-1' } }));
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('sends the email on a later save when the first send failed', async () => {
        db.consultationComment.findUnique.mockResolvedValue(comment({ response: { id: 'r1', emailSentAt: null } }));

        await expect(respondToConsultationComment('c1', 'Ξανά.')).resolves.toMatchObject({ created: false, emailSent: true });

        expect(mockSend).toHaveBeenCalledTimes(1);
        expect(db.consultationCommentResponse.update).toHaveBeenLastCalledWith({ where: { commentId: 'c1' }, data: { emailSentAt: expect.any(Date) } });
    });

    it('keeps the response when the email does not go out, and leaves the send for next time', async () => {
        mockSend.mockResolvedValue(false);

        await expect(respondToConsultationComment('c1', 'Θα το δούμε.')).resolves.toEqual({ response: view, created: true, emailSent: false });

        expect(db.consultationCommentResponse.update).not.toHaveBeenCalled();
    });

    it('still emails when the regulation cannot be fetched, with the consultation name and no place', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;

        await respondToConsultationComment('c1', 'Θα το δούμε.');

        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
            consultationTitle: 'Σύστημα Ελεγχόμενης Στάθμευσης',
            entityLabel: null,
            contactEmail: undefined,
            commentUrl: 'https://opencouncil.gr/papagos-cholargos/consultation/ses?view=comment&entity=res-1',
        }));
    });

    it('refuses an empty or too long response before touching the database', async () => {
        await expect(respondToConsultationComment('c1', '   ')).rejects.toBeInstanceOf(BadRequestError);
        await expect(respondToConsultationComment('c1', 'α'.repeat(5001))).rejects.toBeInstanceOf(BadRequestError);
        expect(db.consultationComment.findUnique).not.toHaveBeenCalled();
    });

    it('needs a signed-in administrator of the comment\'s city', async () => {
        mockUser.mockResolvedValueOnce(null);
        await expect(respondToConsultationComment('c1', 'Θα το δούμε.')).rejects.toBeInstanceOf(UnauthorizedError);

        mockAuthorized.mockResolvedValueOnce(false);
        await expect(respondToConsultationComment('c1', 'Θα το δούμε.')).rejects.toBeInstanceOf(ForbiddenError);
        expect(mockAuthorized).toHaveBeenCalledWith({ cityId: 'papagos-cholargos' });

        db.consultationComment.findUnique.mockResolvedValueOnce(null);
        await expect(respondToConsultationComment('nope', 'Θα το δούμε.')).rejects.toBeInstanceOf(NotFoundError);

        expect(db.consultationCommentResponse.create).not.toHaveBeenCalled();
        expect(mockSend).not.toHaveBeenCalled();
    });
});

describe('deleteConsultationCommentResponse', () => {
    it('removes the response for an administrator of the city', async () => {
        await deleteConsultationCommentResponse('c1');
        expect(db.consultationCommentResponse.deleteMany).toHaveBeenCalledWith({ where: { commentId: 'c1' } });
    });

    it('refuses anyone else', async () => {
        mockAuthorized.mockResolvedValueOnce(false);
        await expect(deleteConsultationCommentResponse('c1')).rejects.toBeInstanceOf(ForbiddenError);
        expect(db.consultationCommentResponse.deleteMany).not.toHaveBeenCalled();
    });
});

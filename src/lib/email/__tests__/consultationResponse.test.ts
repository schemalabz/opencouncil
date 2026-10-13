jest.mock('../resend', () => ({ sendEmail: jest.fn() }));
jest.mock('../render', () => ({ renderReactEmailToHtml: jest.fn().mockResolvedValue('<html>mail</html>') }));

import { sendEmail } from '../resend';
import { responseRecipients, sendConsultationResponseEmail } from '../consultationResponse';

const mockSendEmail = sendEmail as jest.Mock;

describe('responseRecipients', () => {
    it('sends to the author with the administrator and the municipality in CC, and everyone in Reply-To', () => {
        expect(responseRecipients({
            authorEmail: 'maria@example.org',
            adminEmail: 'admin@dpapxol.gov.gr',
            contactEmail: 'info@dpapxol.gov.gr',
            ccEmails: ['mayor@dpapxol.gov.gr'],
        })).toEqual({
            to: 'maria@example.org',
            cc: ['admin@dpapxol.gov.gr', 'info@dpapxol.gov.gr', 'mayor@dpapxol.gov.gr'],
            replyTo: ['maria@example.org', 'admin@dpapxol.gov.gr', 'info@dpapxol.gov.gr', 'mayor@dpapxol.gov.gr'],
        });
    });

    it('never puts the author in CC, and lists each address once', () => {
        expect(responseRecipients({
            authorEmail: 'Admin@dpapxol.gov.gr',
            adminEmail: 'admin@dpapxol.gov.gr',
            contactEmail: 'INFO@dpapxol.gov.gr ',
            ccEmails: ['info@dpapxol.gov.gr', '', 'mayor@dpapxol.gov.gr'],
        })).toEqual({
            to: 'Admin@dpapxol.gov.gr',
            cc: ['INFO@dpapxol.gov.gr', 'mayor@dpapxol.gov.gr'],
            replyTo: ['Admin@dpapxol.gov.gr', 'INFO@dpapxol.gov.gr', 'mayor@dpapxol.gov.gr'],
        });
    });

    it('copes with a consultation that names no contact address', () => {
        expect(responseRecipients({ authorEmail: 'maria@example.org', adminEmail: 'admin@dpapxol.gov.gr' })).toEqual({
            to: 'maria@example.org',
            cc: ['admin@dpapxol.gov.gr'],
            replyTo: ['maria@example.org', 'admin@dpapxol.gov.gr'],
        });
    });
});

describe('sendConsultationResponseEmail', () => {
    const data = {
        authorName: 'Μαρία',
        authorEmail: 'maria@example.org',
        adminEmail: 'admin@dpapxol.gov.gr',
        contactEmail: 'info@dpapxol.gov.gr',
        municipalityName: 'Δήμος Παπάγου - Χολαργού',
        consultationTitle: 'ΣΕΣ',
        entityLabel: 'Βουτσινά, δεξιά πλευρά',
        commentText: 'Λίγες θέσεις.',
        responseText: 'Θα το δούμε.',
        commentUrl: 'https://opencouncil.gr/papagos-cholargos/consultation/ses?view=comment&entity=res-1',
        locale: 'el',
    };

    beforeEach(() => jest.clearAllMocks());

    it('sends from the notifications address, to the author, with the municipality in CC and Reply-To', async () => {
        mockSendEmail.mockResolvedValue({ success: true });

        await expect(sendConsultationResponseEmail(data)).resolves.toBe(true);

        expect(mockSendEmail).toHaveBeenCalledWith({
            from: 'notifications',
            to: 'maria@example.org',
            cc: ['admin@dpapxol.gov.gr', 'info@dpapxol.gov.gr'],
            replyTo: ['maria@example.org', 'admin@dpapxol.gov.gr', 'info@dpapxol.gov.gr'],
            subject: 'Απάντηση του Δήμου στο σχόλιό σας — «ΣΕΣ»',
            html: '<html>mail</html>',
        });
    });

    it('leaves CC out when nobody but the author is left', async () => {
        mockSendEmail.mockResolvedValue({ success: true });

        await sendConsultationResponseEmail({ ...data, adminEmail: 'maria@example.org', contactEmail: null });

        expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'maria@example.org', cc: undefined, replyTo: ['maria@example.org'] }));
    });

    it('reports a send that Resend refused', async () => {
        mockSendEmail.mockResolvedValue({ success: false });
        await expect(sendConsultationResponseEmail(data)).resolves.toBe(false);
    });
});

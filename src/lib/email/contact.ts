import "server-only";
import { isPhoneEmpty, toE164 } from '@/lib/utils/phone';
import { escapeHtml } from '@/lib/utils/html';
import { sendEmail } from './resend';

export interface ContactFormData {
  contactName: string;
  contactPosition: string;
  contactEmail: string;
  contactMunicipality: string;
  contactPhone?: string;
  calculatedPrice?: number | null;
}

/**
 * The confirmation email of the contact form, to the person who filled it in
 * and in copy to the team. The browser reaches this through
 * src/lib/actions/contact.ts, which validates and rate-limits the input.
 */
export async function sendContactEmail(data: ContactFormData) {
  const { contactName, contactPosition, contactEmail, contactMunicipality, contactPhone, calculatedPrice } = data;

  // The phone is optional. The form blocks an invalid number, so refuse one here too.
  const phone = contactPhone && !isPhoneEmpty(contactPhone) ? toE164(contactPhone) : null;
  if (phone && !phone.ok) {
    return { success: false, message: 'Invalid phone number' };
  }

  const subject = 'Ευχαριστούμε για το ενδιαφέρον σας στο OpenCouncil';
  const to = contactEmail;
  const cc = ['christos@opencouncil.gr', 'andreas@opencouncil.gr', 'eliza@opencouncil.gr'];

  const priceInfo = calculatedPrice !== undefined && calculatedPrice !== null
    ? `\nΕκτιμώμενο ετήσιο κόστος: ${calculatedPrice}€ + ΦΠΑ`
    : '';

  // Every field is typed by the sender. Escaped, it is text in the email and nothing more.
  const html = `
    <p>Αγαπητέ/ή ${escapeHtml(contactName)},</p>
    <p>Ευχαριστούμε για το ενδιαφέρον σας στο OpenCouncil. Θα έρθουμε σε επικοινωνία μαζί σας σύντομα.</p>
    <p>Τα στοιχεία που μας δώσατε είναι:</p>
    <ul>
      <li>Όνομα: ${escapeHtml(contactName)}</li>
      <li>Θέση: ${escapeHtml(contactPosition)}</li>
      <li>Email: ${escapeHtml(contactEmail)}</li>
      <li>Δήμος: ${escapeHtml(contactMunicipality)}</li>
      ${phone ? `<li>Τηλέφωνο: ${escapeHtml(phone.e164)}</li>` : ''}
    </ul>
    ${priceInfo}
    <p>Με εκτίμηση,<br>Η ομάδα του OpenCouncil</p>
  `;

  return sendEmail({
    from: 'noreply',
    to,
    cc,
    subject,
    html
  });
}

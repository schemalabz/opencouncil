"use server";
import { headers } from 'next/headers';
import { isPhoneEmpty, toE164 } from '@/lib/utils/phone';
import { claimAllowance } from '@/lib/rate-limit/limiter';
import { clientIp } from '@/lib/rate-limit/rules';
import { sendEmail } from './resend';

/**
 * The form is public and each submission is one email to the typed address
 * with three staff inboxes in copy. A cap on the client stops a script; a
 * cap on the whole form bounds a distributed run, since nobody submits it
 * sixty times an hour in good faith.
 */
const CONTACT_WINDOW_MS = 60 * 60_000;
const MAX_CONTACT_EMAILS_PER_IP_PER_WINDOW = 5;
const MAX_CONTACT_EMAILS_PER_WINDOW = 60;

interface ContactFormData {
  contactName: string;
  contactPosition: string;
  contactEmail: string;
  contactMunicipality: string;
  contactPhone?: string;
  calculatedPrice?: number | null;
}

export async function sendContactEmail(data: ContactFormData) {
  const { contactName, contactPosition, contactEmail, contactMunicipality, contactPhone, calculatedPrice } = data;

  // The phone is optional. The form blocks an invalid number, so refuse one here too.
  const phone = contactPhone && !isPhoneEmpty(contactPhone) ? toE164(contactPhone) : null;
  if (phone && !phone.ok) {
    return { success: false, message: 'Invalid phone number' };
  }

  const ip = clientIp(await headers());
  const claim = await claimAllowance('contact-form', [
    ...(ip ? [{ name: 'ip', key: `rate-limit:contact-form:ip:${ip}`, max: MAX_CONTACT_EMAILS_PER_IP_PER_WINDOW, windowMs: CONTACT_WINDOW_MS }] : []),
    { name: 'all', key: 'rate-limit:contact-form:all', max: MAX_CONTACT_EMAILS_PER_WINDOW, windowMs: CONTACT_WINDOW_MS },
  ]);
  if (!claim.ok) {
    return { success: false, message: 'Too many requests' };
  }

  const subject = 'Ευχαριστούμε για το ενδιαφέρον σας στο OpenCouncil';
  const to = contactEmail;
  const cc = ['christos@opencouncil.gr', 'andreas@opencouncil.gr', 'eliza@opencouncil.gr'];

  const priceInfo = calculatedPrice !== undefined && calculatedPrice !== null
    ? `\nΕκτιμώμενο ετήσιο κόστος: ${calculatedPrice}€ + ΦΠΑ`
    : '';

  const html = `
    <p>Αγαπητέ/ή ${contactName},</p>
    <p>Ευχαριστούμε για το ενδιαφέρον σας στο OpenCouncil. Θα έρθουμε σε επικοινωνία μαζί σας σύντομα.</p>
    <p>Τα στοιχεία που μας δώσατε είναι:</p>
    <ul>
      <li>Όνομα: ${contactName}</li>
      <li>Θέση: ${contactPosition}</li>
      <li>Email: ${contactEmail}</li>
      <li>Δήμος: ${contactMunicipality}</li>
      ${phone ? `<li>Τηλέφωνο: ${phone.e164}</li>` : ''}
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

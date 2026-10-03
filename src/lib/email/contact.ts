"use server";
import { isPhoneEmpty, toE164 } from '@/lib/utils/phone';
import { sendEmail } from './resend';

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

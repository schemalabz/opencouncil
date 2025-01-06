"use server";
import { sendEmail } from './resend';

interface ContactFormData {
    contactName: string;
    contactPosition: string;
    contactEmail: string;
    contactMunicipality: string;
    calculatedPrice?: number | null;
}

export async function sendContactEmail(data: ContactFormData) {
    const { contactName, contactPosition, contactEmail, contactMunicipality, calculatedPrice } = data;

    const subject = 'Ευχαριστούμε για το ενδιαφέρον σας στο OpenCouncil';
    const to = contactEmail;
    const cc = 'christos@opencouncil.gr';
    const from = 'noreply@opencouncil.gr';

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
    </ul>
    ${priceInfo}
    <p>Με εκτίμηση,<br>Η ομάδα του OpenCouncil</p>
  `;

    return sendEmail({
        from,
        to,
        cc,
        subject,
        html
    });
}

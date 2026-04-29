/**
 * Allowlist used by both the editor preview and the server-side render so
 * that what the admin sees in Preview matches the HTML actually shipped to
 * recipients. Any tag/attribute not in this list is stripped by DOMPurify
 * (along with all on* event handlers and unsafe URL schemes by default).
 */
export const SANITIZE_CONFIG = {
    ALLOWED_TAGS: [
        'span', 'a', 'div', 'p',
        'ul', 'ol', 'li',
        'blockquote', 'hr', 'br',
        'h1', 'h2', 'h3', 'h4', 'h5',
        'strong', 'em',
    ],
    ALLOWED_ATTR: ['style', 'href'],
};

/**
 * Default markdown the product-update email composer loads with. Admins can
 * edit anything — the only special syntax is two placeholders that are
 * substituted per recipient at send time:
 *   - {{userName}}        → the recipient's name (or a generic fallback)
 *   - {{unsubscribeUrl}}  → the per-user HMAC-signed unsubscribe URL
 */
export const DEFAULT_PRODUCT_UPDATE_TEMPLATE_MARKDOWN = `Γεια σου {{userName}},

Οι παρακάτω ενημερώσεις βοηθούν το OpenCouncil να ανταποκρίνεται καλύτερα στις δικές σας ανάγκες και της πόλης σας:

- Πρώτη ενημέρωση
- Δεύτερη ενημέρωση
- Τρίτη ενημέρωση

Επίσης, θέλουμε να σας ευχαριστήσουμε για την ανατροφοδότησή σας — είστε ευπρόσδεκτοι να μας στείλετε τα σχόλια και τις παρατηρήσεις σας ανά πάσα στιγμή.

<div style="background-color:#f3f4f6;border-left:4px solid #fc550a;padding:16px 20px;border-radius:6px;margin:16px 0;color:#374151;">Γνωρίζατε ότι μπορείτε να διαχειριστείτε τις προτιμήσεις των ειδοποιήσεών σας από το προφίλ σας; Επιλέξτε τα θέματα και τις τοποθεσίες που σας ενδιαφέρουν.</div>

<a href="https://opencouncil.gr" style="display:inline-block;background-color:#fc550a;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;line-height:1.4;">Επισκεφθείτε το OpenCouncil</a>


<br/>
Με εκτίμηση, <br/>
Η ομάδα του OpenCouncil
<br/>

---

<br/>

Δεν θέλετε να λαμβάνετε τέτοιες ενημερώσεις; [Απεγγραφή]({{unsubscribeUrl}})
`;

/**
 * Per-recipient placeholder substitution on the editor's sanitized HTML.
 * Sanitization runs client-side so the server doesn't need jsdom.
 *
 * marked URL-encodes the href of markdown links, so a placeholder inside a
 * link target like `[…]({{unsubscribeUrl}})` lands in the HTML as
 * `%7B%7BunsubscribeUrl%7D%7D`. We replace both the literal and the
 * URL-encoded form so substitution works whether the placeholder appears in
 * body text or as a link href.
 *
 * When `userName` is empty, the placeholder *and* its leading space are
 * stripped — so a template like `Γεια σου {{userName}},` collapses cleanly
 * to `Γεια σου,` rather than leaving an awkward `Γεια σου ,`.
 */
export function fillProductUpdatePlaceholders(
    html: string,
    values: { userName: string; unsubscribeUrl: string },
): string {
    let result = html;
    if (!values.userName) {
        result = result.replaceAll(' {{userName}}', '');
    }
    return result
        .replaceAll('{{userName}}', values.userName)
        .replaceAll(encodeURI('{{userName}}'), values.userName)
        .replaceAll('{{unsubscribeUrl}}', values.unsubscribeUrl)
        .replaceAll(encodeURI('{{unsubscribeUrl}}'), values.unsubscribeUrl);
}


/**
 * No integration test may reach Resend. The real module builds a client from
 * whatever key the env mock holds and calls api.resend.com, so a test that
 * releases an email delivery would otherwise depend on the network.
 */
export async function sendEmail() {
    return { success: true, message: 'Email sent successfully' };
}

export async function sendEmailBatch() {
    return { success: true, failedTos: [] };
}

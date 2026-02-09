/**
 * Test script for sendTranscriptToMunicipality
 *
 * Usage:
 *   npx tsx scripts/test_send_transcript.ts <cityId> <meetingId>
 *
 * Example:
 *   npx tsx scripts/test_send_transcript.ts chania jan15_2025
 *
 * Prerequisites:
 * 1. Set DEV_EMAIL_OVERRIDE in .env to your email address
 * 2. Set contactEmails on the meeting's administrative body (use Prisma Studio: npm run prisma:studio)
 */

import { sendTranscriptToMunicipality } from '../src/lib/tasks/sendTranscript';

async function main() {
    const [cityId, meetingId] = process.argv.slice(2);

    if (!cityId || !meetingId) {
        console.error('Usage: npx tsx scripts/test_send_transcript.ts <cityId> <meetingId>');
        console.error('Example: npx tsx scripts/test_send_transcript.ts chania jan15_2025');
        process.exit(1);
    }

    console.log(`Testing sendTranscriptToMunicipality for ${cityId}/${meetingId}...`);
    console.log('');

    const result = await sendTranscriptToMunicipality(cityId, meetingId);

    console.log('');
    console.log('Result:', JSON.stringify(result, null, 2));

    if (result.success && !result.skipped) {
        console.log(`✓ Email sent to ${result.recipientEmails?.join(', ')}`);
    } else if (result.skipped) {
        console.log('⚠ Skipped: No contactEmails configured on administrative body');
        console.log('  To test, set contactEmails using Prisma Studio: npm run prisma:studio');
    } else {
        console.log(`✗ Failed: ${result.error}`);
    }
}

main().catch(console.error);

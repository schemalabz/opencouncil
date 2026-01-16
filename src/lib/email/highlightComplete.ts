import { sendEmail } from './resend';
import { renderReactEmailToHtml } from './render';
import { HighlightCompleteEmail } from './templates/HighlightCompleteEmail';
import prisma from '@/lib/db/prisma';
import { formatDuration } from '@/lib/formatters/time';
import { env } from '@/env.mjs';

interface SendHighlightCompleteEmailParams {
    userId: string;
    highlightId: string;
    status: 'success' | 'failure';
}

export async function sendHighlightCompleteEmail({
    userId,
    highlightId,
    status
}: SendHighlightCompleteEmailParams) {
    try {
        // Fetch user details
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                name: true,
                email: true
            }
        });

        if (!user || !user.email) {
            console.error('User not found or has no email:', userId);
            return;
        }

        // Fetch highlight details with meeting and city relations
        const highlight = await prisma.highlight.findUnique({
            where: { id: highlightId },
            include: {
                meeting: {
                    include: {
                        city: {
                            select: {
                                name: true
                            }
                        }
                    }
                },
                highlightedUtterances: {
                    include: {
                        utterance: {
                            select: {
                                startTimestamp: true,
                                endTimestamp: true
                            }
                        }
                    }
                }
            }
        });

        if (!highlight) {
            console.error('Highlight not found:', highlightId);
            return;
        }

        // Calculate duration from utterances
        let totalDuration = 0;
        if (highlight.highlightedUtterances.length > 0) {
            for (const hu of highlight.highlightedUtterances) {
                const duration = hu.utterance.endTimestamp - hu.utterance.startTimestamp;
                totalDuration += duration;
            }
        }

        const formattedDuration = formatDuration(totalDuration);

        // Build the highlight URL (default to Greek locale)
        const highlightUrl = `${env.NEXT_PUBLIC_BASE_URL}/el/${highlight.cityId}/${highlight.meetingId}/highlights/${highlight.id}`;

        // Prepare email data
        const userName = user.name || user.email.split('@')[0];
        const highlightTitle = highlight.name || 'Χωρίς τίτλο';
        const meetingName = highlight.meeting.name || `Συνεδρίαση ${new Date(highlight.meeting.dateTime).toLocaleDateString('el-GR')}`;
        const cityName = highlight.meeting.city.name;

        // Render the email template
        const html = await renderReactEmailToHtml(
            HighlightCompleteEmail({
                userName,
                highlightTitle,
                meetingName,
                cityName,
                duration: formattedDuration,
                highlightUrl,
                status
            })
        );

        // Determine subject line based on status
        const subject = status === 'success' 
            ? 'Το Στιγμιότυπο σας είναι έτοιμο!'
            : 'Πρόβλημα με τη δημιουργία Στιγμιότυπου';

        // Send the email
        await sendEmail({
            from: 'OpenCouncil <notifications@opencouncil.gr>',
            to: user.email,
            subject,
            html
        });

        console.log(`Highlight completion email sent to ${user.email} (status: ${status})`);
    } catch (error) {
        // Log error but don't throw - email is nice-to-have, not critical
        console.error('Error sending highlight completion email:', error);
    }
}


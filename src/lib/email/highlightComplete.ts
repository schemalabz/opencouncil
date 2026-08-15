import { sendEmail } from './resend';
import { renderReactEmailToHtml } from './render';
import { HighlightCompleteEmail, highlightCompleteCopy } from './templates/HighlightCompleteEmail';
import { emailBaseUrlForRealm, emailLocaleForRealm } from './emailLocale';
import prisma from '@/lib/db/prisma';
import { formatDate, formatDuration } from '@/lib/formatters/time';
import { getLocalizedName } from '@/lib/formatters/name';

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
                                name: true,
                                name_en: true,
                                realm: true,
                                timezone: true
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

        // The city's realm decides both the domain and the language: this runs
        // from a task callback, so there is no request host to read, and the
        // highlight only exists on its own realm's site (a .gr link to a Serbian
        // city 404s). A realm serves its default locale unprefixed, so the URL
        // carries no locale segment — the old link hardcoded /el on top of .gr.
        const { realm } = highlight.meeting.city;
        const locale = emailLocaleForRealm(realm);
        const copy = highlightCompleteCopy(locale);
        const highlightUrl = `${emailBaseUrlForRealm(realm)}/${highlight.cityId}/${highlight.meetingId}/highlights/${highlight.id}`;

        // Prepare email data
        const userName = user.name || user.email.split('@')[0];
        const highlightTitle = highlight.name || copy.untitled;
        const meetingName =
            getLocalizedName(highlight.meeting, locale) ||
            copy.meetingOn(formatDate(new Date(highlight.meeting.dateTime), highlight.meeting.city.timezone, locale));
        const cityName = getLocalizedName(highlight.meeting.city, locale);

        // Render the email template
        const html = await renderReactEmailToHtml(
            HighlightCompleteEmail({
                userName,
                highlightTitle,
                meetingName,
                cityName,
                duration: formattedDuration,
                highlightUrl,
                status,
                locale
            })
        );

        // Determine subject line based on status
        const subject = status === 'success' ? copy.subjectSuccess : copy.subjectFailure;

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


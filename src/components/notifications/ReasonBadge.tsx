"use client";

import { BadgeWithExplanation } from "@/components/ui/badge-with-explanation";

export function ReasonBadge({ reason }: { reason: string }) {
    const badges = {
        proximity: {
            label: 'Τοποθεσία',
            variant: 'default' as const,
            explanation: 'Αυτό το θέμα επιλέχθηκε επειδή βρίσκεται κοντά σε μία από τις τοποθεσίες που έχετε επιλέξει στις προτιμήσεις ειδοποιήσεών σας.'
        },
        topic: {
            label: 'Θεματική',
            variant: 'secondary' as const,
            explanation: 'Αυτό το θέμα επιλέχθηκε επειδή αφορά μία από τις θεματικές κατηγορίες που έχετε επιλέξει στις προτιμήσεις ειδοποιήσεών σας.'
        },
        generalInterest: {
            label: 'Γενικού ενδιαφέροντος',
            variant: 'outline' as const,
            explanation: 'Αυτό το θέμα επιλέχθηκε ως θέμα γενικού ενδιαφέροντος για όλους τους χρήστες που λαμβάνουν ενημερώσεις για τον Δήμο.'
        }
    };

    const badge = badges[reason as keyof typeof badges] || badges.generalInterest;

    return (
        <BadgeWithExplanation
            label={badge.label}
            explanation={badge.explanation}
            variant={badge.variant}
            className="text-xs"
        />
    );
}


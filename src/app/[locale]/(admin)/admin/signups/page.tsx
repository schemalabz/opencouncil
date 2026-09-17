import { SignupsDashboard } from "@/components/admin/signups/SignupsDashboard";
import { withUserAuthorizedToEdit } from "@/lib/auth";
import { summarizeSignups, type SignupRow } from "@/lib/admin/signup-series";
import { getEmailSignupData } from "@/lib/db/adminStats";
import { getNotisRoster, type NotisRosterEntry } from "@/lib/notis/client";

export const dynamic = "force-dynamic";

/**
 * The signups page, for whoever runs marketing: per capita is the figure,
 * phone the channel that matters, and the total the headline. The email half
 * comes from this database; the phone half from the Notis service, which alone
 * knows who is still active. Both arrive as the same row, so one function
 * answers for the phone channel and for every channel together.
 */
export default async function SignupsPage() {
    await withUserAuthorizedToEdit({});
    const [email, notis] = await Promise.all([getEmailSignupData(), getNotisRoster()]);
    const phoneRows = notis.ok ? notis.data.map(toRow) : null;
    // One clock for both figures, so the two tabs never land on different
    // days or different 7-day windows.
    const now = new Date();

    return (
        <div className="container mx-auto px-4 py-8">
            <SignupsDashboard
                cities={email.cities}
                phone={phoneRows ? summarizeSignups(phoneRows, now) : null}
                all={phoneRows ? summarizeSignups([...phoneRows, ...email.rows], now) : null}
                notisReason={notis.ok ? null : notis.reason}
            />
        </div>
    );
}

function toRow(entry: NotisRosterEntry): SignupRow {
    return {
        userId: entry.userId,
        cityIds: entry.cityIds,
        createdAt: new Date(entry.createdAt),
        endedAt: entry.endedAt ? new Date(entry.endedAt) : null,
    };
}

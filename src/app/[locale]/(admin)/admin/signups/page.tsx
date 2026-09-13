import { SignupsDashboard, type ChannelStats } from "@/components/admin/signups/SignupsDashboard";
import { withUserAuthorizedToEdit } from "@/lib/auth";
import { getEmailSignupStats, type EmailSignupStats, type SignupCity } from "@/lib/db/adminStats";
import { getNotisStats, type NotisStats } from "@/lib/notis/client";

export const dynamic = "force-dynamic";

/**
 * The signups page, for whoever runs marketing: per capita is the figure,
 * Notis the channel that matters, email the other one. The email half comes
 * from this database; the Notis half from the Notis service, which alone
 * knows who is still active. Both are shaped alike here, so the page is one
 * component and a switch.
 */
export default async function SignupsPage() {
    await withUserAuthorizedToEdit({});
    const [email, notis] = await Promise.all([getEmailSignupStats(), getNotisStats()]);

    return (
        <div className="container mx-auto px-4 py-8">
            <SignupsDashboard
                email={emailChannel(email)}
                notis={notis.ok ? notisChannel(notis.data, email.cities) : null}
                notisReason={notis.ok ? null : notis.reason}
            />
        </div>
    );
}

function emailChannel(email: EmailSignupStats): ChannelStats {
    return {
        people: email.people,
        cities: email.cities.map((city) => ({ ...city, subscribers: email.subscribersByCity[city.cityId] ?? 0 })),
        weeks: email.weeks,
        newLast7Days: email.newLast7Days,
        newPrev7Days: email.newPrev7Days,
        stoppedLast7Days: null,
    };
}

function notisChannel(stats: NotisStats, cities: SignupCity[]): ChannelStats {
    const activeByCity = new Map(stats.cities.map((c) => [c.cityId, c.active]));
    return {
        people: stats.active,
        cities: cities.map((city) => ({ ...city, subscribers: activeByCity.get(city.cityId) ?? 0 })),
        weeks: stats.weeks.map((w) => ({ start: w.start, total: w.active })),
        newLast7Days: stats.newLast7Days,
        newPrev7Days: stats.newPrev7Days,
        stoppedLast7Days: stats.stoppedLast7Days,
    };
}

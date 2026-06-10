import { Bell, Clock, FileText, Landmark, MessageCircle, Search, Send, Users } from 'lucide-react';
import { StatsCard } from '@/components/ui/stats-card';
import { ReviewsOverviewWidget } from '@/components/admin/reviews/ReviewsOverviewWidget';
import { getAdminDashboardStats } from '@/lib/db/adminStats';

export default async function Page() {
    const stats = await getAdminDashboardStats();

    const round1 = (n: number) => Math.round(n * 10) / 10;

    return (
        <div className="container mx-auto px-4 py-8 space-y-10">
            <div>
                <h1 className="text-2xl font-bold">Admin Dashboard</h1>
                <p className="text-muted-foreground mt-1">
                    An overview of users, content, and engagement across OpenCouncil.
                </p>
            </div>

            {/* w-fit shrinks each heading box so the global centered-h2 rule
                can't visually center it within the page column. */}
            <section>
                <h2 className="w-fit mb-3">Community</h2>
                <StatsCard
                    columns={3}
                    items={[
                        {
                            title: 'Total Users',
                            value: stats.users.total,
                            icon: <Users className="h-4 w-4" />,
                            description: `+${stats.users.newLast7Days} in last 7 days`,
                            trend: {
                                value: round1(stats.users.percentChange),
                                isPositive: stats.users.percentChange >= 0,
                            },
                        },
                        {
                            title: 'Notification Signups',
                            value: stats.notifications.usersWithPreferences,
                            icon: <Bell className="h-4 w-4" />,
                            description: `+${stats.notifications.newPreferencesThisWeek} preferences this week`,
                        },
                        {
                            title: 'Petitions',
                            value: stats.petitions.total,
                            icon: <FileText className="h-4 w-4" />,
                            description: `+${stats.petitions.newThisWeek} this week`,
                        },
                    ]}
                />
            </section>

            <section>
                <h2 className="w-fit mb-3">This Week</h2>
                <StatsCard
                    columns={4}
                    items={[
                        {
                            title: 'Notifications Sent',
                            value: stats.notifications.sentThisWeek,
                            icon: <Send className="h-4 w-4" />,
                            description: 'deliveries in the last 7 days',
                        },
                        {
                            title: 'Meetings Added',
                            value: stats.content.meetingsAddedThisWeek,
                            icon: <FileText className="h-4 w-4" />,
                            description: `${stats.content.releasedOfThose} of which released`,
                        },
                        {
                            title: 'Meeting Hours Processed',
                            value: stats.content.meetingHoursThisWeek,
                            icon: <Clock className="h-4 w-4" />,
                            description: 'released meetings added this week',
                        },
                        {
                            title: 'Supported Cities',
                            value: stats.content.supportedCities,
                            icon: <Landmark className="h-4 w-4" />,
                            description: 'officially supported, all time',
                        },
                    ]}
                />
            </section>

            <section>
                <h2 className="w-fit">Engagement This Week</h2>
                <p className="text-sm text-muted-foreground mt-1 mb-3">
                    Searches and WhatsApp/SMS messages. AI chat queries are not persisted, so they cannot be shown.
                </p>
                <StatsCard
                    columns={4}
                    items={[
                        {
                            title: 'Searches',
                            value: stats.engagement.searches.thisWeek,
                            icon: <Search className="h-4 w-4" />,
                            description: `${stats.engagement.searches.prevWeek} in the previous 7 days`,
                            trend: {
                                value: round1(stats.engagement.searches.percentChange),
                                isPositive: stats.engagement.searches.percentChange >= 0,
                            },
                        },
                        {
                            title: 'Inbound Messages',
                            value: stats.engagement.inbound.total,
                            icon: <MessageCircle className="h-4 w-4" />,
                            description: `${stats.engagement.inbound.whatsapp} WhatsApp · ${stats.engagement.inbound.sms} SMS`,
                        },
                        {
                            title: 'Outbound Messages',
                            value: stats.engagement.outbound.total,
                            icon: <Send className="h-4 w-4" />,
                            description: `${stats.engagement.outbound.whatsapp} WhatsApp · ${stats.engagement.outbound.sms} SMS`,
                        },
                    ]}
                />
            </section>

            <section>
                <ReviewsOverviewWidget />
            </section>
        </div>
    );
}

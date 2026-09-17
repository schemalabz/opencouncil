"use client";

import { useState } from "react";
import { Percent, TrendingUp, Users } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { StatsCard } from "@/components/ui/stats-card";
import type { SignupSummary } from "@/lib/admin/signup-series";
import type { SignupCity } from "@/lib/db/adminStats";
import { formatDayMonth } from "@/lib/formatters/time";
import { cn } from "@/lib/utils";

/** Phone is Notis alone; all is every way a person can subscribe, phone or email. */
export type SignupChannel = "phone" | "all";

const chartConfig: ChartConfig = {
    total: { label: "Subscribers", color: "hsl(var(--chart-1))" },
};

const fmt = (n: number) => n.toLocaleString("el-GR");
const residents = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n);
const perMille = (subscribers: number, population: number) => (subscribers / population) * 1000;
// Enough decimals to keep a small municipality's figure from reading as zero.
const fmtPerMille = (x: number) => `${x.toFixed(x >= 10 ? 1 : x >= 1 ? 2 : 3)}‰`;
// The week starts are UTC Mondays, so the label is pinned to UTC: the same
// text on the server and in every browser.
const dayLabel = (start: string) => formatDayMonth(new Date(start), "UTC", "en");

/**
 * The signups page: one switch between the phone subscribers and all of them,
 * and everything under it follows — the tiles, the per-municipality bars, the
 * line. Per capita is the number that matters for marketing, so it
 * leads: ‰ of the residents of each supported municipality, highest first.
 */
export function SignupsDashboard({
    cities,
    phone,
    all,
    notisReason,
}: {
    cities: SignupCity[];
    phone: SignupSummary | null;
    all: SignupSummary | null;
    /** Why Notis's half is missing, when it is. Both figures need it. */
    notisReason: string | null;
}) {
    const [channel, setChannel] = useState<SignupChannel>("phone");
    const summary = channel === "phone" ? phone : all;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Signups</h1>
                    <p className="text-muted-foreground mt-1">
                        How many people are signed up, per resident of each municipality, and how that moves week to week.
                    </p>
                </div>
                <div role="tablist" aria-label="Channel" className="flex h-9 items-center gap-0.5 rounded-md bg-muted p-1">
                    {(
                        [
                            ["phone", "Phone"],
                            ["all", "All"],
                        ] as const
                    ).map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            role="tab"
                            aria-selected={channel === value}
                            onClick={() => setChannel(value)}
                            className={cn(
                                "h-7 rounded-sm px-3 text-sm font-medium transition-colors",
                                channel === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {summary ? (
                <ChannelView channel={channel} cities={cities} summary={summary} />
            ) : (
                <Card disableHover>
                    <CardHeader>
                        <CardTitle className="text-base">Notis did not answer</CardTitle>
                        <CardDescription>
                            {notisReason === "unconfigured"
                                ? "NOTIS_API_URL and NOTIS_SERVICE_TOKEN are not set on this deployment."
                                : "The Notis service is unreachable right now. Reload in a minute."}{" "}
                            Both figures count the phone subscribers, so neither is shown without it.
                        </CardDescription>
                    </CardHeader>
                </Card>
            )}
        </div>
    );
}

function ChannelView({ channel, cities, summary }: { channel: SignupChannel; cities: SignupCity[]; summary: SignupSummary }) {
    const population = cities.reduce((sum, c) => sum + c.population, 0);
    const change =
        summary.newPrev7Days > 0 ? Math.round(((summary.newLast7Days - summary.newPrev7Days) / summary.newPrev7Days) * 100) : null;
    const ranked = cities
        .map((city) => ({ ...city, subscribers: summary.subscribersByCity[city.cityId] ?? 0 }))
        .sort((a, b) => perMille(b.subscribers, b.population) - perMille(a.subscribers, a.population));
    const scale = Math.max(6, (ranked[0] ? perMille(ranked[0].subscribers, ranked[0].population) : 0) * 1.06);
    const weekly = summary.weeks.map((w) => ({ ...w, label: dayLabel(w.start) }));
    const first = summary.weeks[0]?.total ?? 0;
    const growth = first > 0 ? Math.round(((summary.people - first) / first) * 100) : null;

    return (
        <>
            <StatsCard
                columns={3}
                items={[
                    {
                        title: "Subscribers",
                        value: fmt(summary.people),
                        icon: <Users className="h-4 w-4" />,
                        description: channel === "phone" ? "active on Notis, as Notis has them" : "on the phone, the email summary, or both",
                    },
                    {
                        title: "Per capita",
                        value: population > 0 ? fmtPerMille(perMille(summary.people, population)) : "—",
                        icon: <Percent className="h-4 w-4" />,
                        description: `per 1,000 residents, across ${residents(population)} residents in ${cities.length} municipalities`,
                    },
                    {
                        title: "New in the last 7 days",
                        value: `+${fmt(summary.newLast7Days)}`,
                        icon: <TrendingUp className="h-4 w-4" />,
                        description: `${fmt(summary.newPrev7Days)} in the previous 7 days · ${fmt(summary.stoppedLast7Days)} ${
                            channel === "phone" ? "said ΣΤΟΠ" : "stopped every channel"
                        }`,
                        ...(change !== null ? { trend: { value: Math.abs(change), isPositive: change >= 0 } } : {}),
                    },
                ]}
            />

            <Card disableHover>
                <CardHeader>
                    <CardTitle className="text-base">Per municipality</CardTitle>
                    <CardDescription>
                        {channel === "phone" ? "Active Notis subscribers" : "Subscribers on any channel"} per 1,000 residents, highest first.
                        The number on the right is the count. Dashed lines at 1‰ and 5‰.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col gap-1">
                        {ranked.map((city, i) => {
                            const value = perMille(city.subscribers, city.population);
                            return (
                                <div key={city.cityId} className="flex h-9 items-center gap-4">
                                    <div className="flex w-48 shrink-0 flex-col">
                                        <span className="truncate text-[13px] font-medium leading-4">{city.name}</span>
                                        <span className="text-[11px] leading-[14px] text-muted-foreground">{residents(city.population)} residents</span>
                                    </div>
                                    <div className="relative h-[22px] flex-1">
                                        {[1, 5].map((mark) => (
                                            <div
                                                key={mark}
                                                className="absolute -top-1.5 -bottom-1.5 border-l border-dashed border-border"
                                                style={{ left: `${(mark / scale) * 100}%` }}
                                            >
                                                {i === 0 && (
                                                    <span className="absolute -top-[18px] -left-2.5 text-[10px] text-muted-foreground">{mark}‰</span>
                                                )}
                                            </div>
                                        ))}
                                        <div
                                            className="absolute top-[3px] h-4 rounded-[3px] bg-[hsl(var(--chart-1))]"
                                            style={{ width: `${Math.min(100, (value / scale) * 100)}%` }}
                                        />
                                    </div>
                                    <div className="flex w-28 shrink-0 items-baseline justify-end gap-1.5 tabular-nums">
                                        <span className="text-[13px] font-semibold">{fmtPerMille(value)}</span>
                                        <span className="text-xs text-muted-foreground">{fmt(city.subscribers)}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            <Card disableHover>
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                    <div className="space-y-1.5">
                        <CardTitle className="text-base">Subscribers over time</CardTitle>
                        <CardDescription>People subscribed at the end of each week, last 12 weeks, weeks starting Monday.</CardDescription>
                    </div>
                    <div className="flex items-baseline gap-1.5 tabular-nums">
                        <span className="text-xl font-bold">{fmt(summary.people)}</span>
                        {growth !== null && (
                            <span className={cn("text-xs font-medium", growth >= 0 ? "text-green-700" : "text-red-700")}>
                                {growth >= 0 ? "+" : ""}
                                {growth}% in 12 weeks
                            </span>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    <ChartContainer config={chartConfig} className="h-[240px] w-full">
                        <AreaChart data={weekly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} />
                            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Area
                                type="monotone"
                                dataKey="total"
                                stroke="var(--color-total)"
                                fill="var(--color-total)"
                                fillOpacity={0.12}
                                strokeWidth={2}
                                dot={false}
                            />
                        </AreaChart>
                    </ChartContainer>
                </CardContent>
            </Card>
        </>
    );
}

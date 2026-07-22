"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartConfig, ChartTooltip } from "@/components/ui/chart";
import {
    Bar,
    BarChart,
    CartesianGrid,
    LabelList,
    ReferenceLine,
    XAxis,
    YAxis,
} from "recharts";
import type { CitySubscriberStats } from "@/lib/db/adminStats";

const chartConfig: ChartConfig = {
    perMille: {
        label: "Subscribers ‰",
        color: "hsl(var(--chart-1))",
    },
};

function SubscribersTooltip({
    active,
    payload,
}: {
    active?: boolean;
    payload?: Array<{ payload: CitySubscriberStats }>;
}) {
    if (!active || !payload?.length) return null;
    const city = payload[0].payload;
    return (
        <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-md">
            <div className="font-medium">{city.name}</div>
            <div className="text-muted-foreground">
                {city.perMille.toFixed(2)}‰ of population
            </div>
            <div className="text-muted-foreground">
                {city.subscribers.toLocaleString("el-GR")} subscribers ·{" "}
                {city.population.toLocaleString("el-GR")} residents
            </div>
        </div>
    );
}

/**
 * Marketing-penetration chart: notification subscribers per supported
 * municipality as thousandths (‰) of its population, highest to lowest,
 * with reference lines at 1‰ and 5‰.
 */
export function NotificationSubscribersChart({ data }: { data: CitySubscriberStats[] }) {
    const maxPerMille = data.reduce((max, c) => Math.max(max, c.perMille), 0);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Notification Subscribers per Municipality</CardTitle>
                <CardDescription>
                    Users with notification preferences as ‰ of each supported
                    municipality&apos;s population. Bar labels show absolute subscriber counts.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <ChartContainer config={chartConfig} className="h-[400px] w-full">
                    <BarChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                            dataKey="name"
                            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                            angle={-45}
                            textAnchor="end"
                            height={90}
                            interval={0}
                        />
                        <YAxis
                            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                            tickFormatter={(value: number) => `${value}‰`}
                            // Keep the 5‰ target line visible even when every
                            // city is below it.
                            domain={[0, Math.max(Math.ceil(maxPerMille * 1.15 * 10) / 10, 5.5)]}
                        />
                        <ChartTooltip content={<SubscribersTooltip />} />
                        <ReferenceLine
                            y={1}
                            stroke="hsl(var(--muted-foreground))"
                            strokeDasharray="4 4"
                            label={{
                                value: "1‰",
                                position: "insideTopRight",
                                fill: "hsl(var(--muted-foreground))",
                                fontSize: 12,
                            }}
                        />
                        <ReferenceLine
                            y={5}
                            stroke="hsl(var(--muted-foreground))"
                            strokeDasharray="4 4"
                            label={{
                                value: "5‰",
                                position: "insideTopRight",
                                fill: "hsl(var(--muted-foreground))",
                                fontSize: 12,
                            }}
                        />
                        <Bar dataKey="perMille" fill="var(--color-perMille)" radius={[4, 4, 0, 0]}>
                            <LabelList
                                dataKey="cityId"
                                position="top"
                                content={({ x, y, width, index }) => {
                                    if (index === undefined) return null;
                                    const city = data[index];
                                    const cx = Number(x) + Number(width) / 2;
                                    return (
                                        <text
                                            x={cx}
                                            y={Number(y) - 6}
                                            textAnchor="middle"
                                            fontSize={11}
                                            className="fill-foreground"
                                        >
                                            {city.perMille.toFixed(2)}
                                            <tspan className="fill-muted-foreground" fontSize={10}>
                                                {` (${city.subscribers.toLocaleString("el-GR")})`}
                                            </tspan>
                                        </text>
                                    );
                                }}
                            />
                        </Bar>
                    </BarChart>
                </ChartContainer>
            </CardContent>
        </Card>
    );
}

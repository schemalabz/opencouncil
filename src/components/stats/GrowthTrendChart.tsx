"use client";

import { useId } from "react";
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    ChartConfig,
} from "@/components/ui/chart";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
} from "recharts";
import { MonthlyGrowthItem } from "@/lib/db/insights";

interface GrowthTrendChartProps {
    data: MonthlyGrowthItem[];
}

const chartConfig: ChartConfig = {
    hours: {
        label: "Ώρες",
        color: "hsl(var(--primary))",
    },
};

export function GrowthTrendChart({ data }: GrowthTrendChartProps) {
    const id = useId();
    const gradientId = `gradHours-${id}`;
    const chartData = data.map((item) => ({
        month: item.month,
        hours: Math.round(item.totalSeconds / 3600),
    }));

    return (
        <section
            data-testid="growth-trend-chart"
            className="bg-card/50 rounded-2xl border border-border/40 p-8"
        >
            <h2 className="font-semibold text-xl text-foreground mb-6">
                Μηνιαία Εξέλιξη
            </h2>
            <ChartContainer config={chartConfig} className="h-64 w-full">
                <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                        dataKey="month"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={(v: string) => {
                            const [year, month] = v.split("-");
                            return `${month}/${year.slice(2)}`;
                        }}
                        className="text-xs fill-muted-foreground"
                    />
                    <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        className="text-xs fill-muted-foreground"
                        tickFormatter={(v: number) => `${v}h`}
                    />
                    <ChartTooltip
                        content={
                            <ChartTooltipContent
                                labelFormatter={(label: string) => {
                                    const [year, month] = label.split("-");
                                    return `${month}/${year}`;
                                }}
                                formatter={(value) => [`${value}h`, "Ώρες"]}
                            />
                        }
                    />
                    <Area
                        type="monotone"
                        dataKey="hours"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        fill={`url(#${gradientId})`}
                        dot={false}
                    />
                </AreaChart>
            </ChartContainer>
        </section>
    );
}

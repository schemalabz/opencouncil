"use client"

import { getStatisticsFor, StatisticsOfCouncilMeeting } from "@/lib/statistics"
import { useEffect, useState, useMemo } from "react"
import { useCouncilMeetingData } from "./CouncilMeetingDataContext"
import { Cell, Label, Pie, PieChart, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from "recharts"
import { getAllTopics } from "@/lib/db/topics"
import { Topic } from "@prisma/client"
import TopicBadge from "./transcript/Topic"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartConfig, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { BarChart2, BarChartIcon, Clock, FileBarChart2, FileIcon, Loader2, PieChartIcon } from "lucide-react"
import { useTranslations } from "next-intl"

export function Statistics() {
    const [statistics, setStatistics] = useState<StatisticsOfCouncilMeeting | null>(null)
    const { meeting, getParty } = useCouncilMeetingData();
    const t = useTranslations('Statistics');

    useEffect(() => {
        getStatisticsFor({ meetingId: meeting.id, cityId: meeting.cityId }, ['topic', 'person', 'party']).then((s) => {
            setStatistics(s as StatisticsOfCouncilMeeting)
        })
    }, [meeting.id, meeting.cityId])

    const chartData = useMemo(() => {
        if (!statistics || !statistics.parties) return []
        return statistics.parties.map(party => ({
            name: party.item.name_short,
            minutes: Math.round(party.speakingSeconds / 60),
            fill: party.item.colorHex
        }))
    }, [statistics])

    const totalMinutes = useMemo(() => {
        return chartData.reduce((acc, curr) => acc + curr.minutes, 0)
    }, [chartData])

    const sortedTopics = useMemo(() => {
        if (!statistics || !statistics.topics) return [];
        return statistics.topics
            .sort((a, b) => b.count - a.count)
            .map(topicStat => ({
                ...topicStat,
                topic: topicStat.item
            }));
    }, [statistics]);

    const speakerChartData = useMemo(() => {
        if (!statistics || !statistics.people) return [];
        return statistics.people
            .sort((a, b) => b.speakingSeconds - a.speakingSeconds)
            .slice(0, 10)
            .map(person => ({
                name: person.item.name,
                minutes: Math.round(person.speakingSeconds / 60),
                fill: (person.item.partyId && getParty(person.item.partyId)?.colorHex) ?? "gray"
            }));
    }, [statistics, getParty]);

    const chartConfig: ChartConfig = {
        minutes: {
            label: t('minutes'),
            color: "hsl(var(--chart-1))",
        },
        label: {
            color: "hsl(var(--background))",
        },
    };

    if (!statistics) return (
        <div className="flex justify-center items-center w-full h-full">
            <Loader2 className="w-8 h-8 animate-spin" />
        </div>
    )

    if (totalMinutes === 0) {
        return <div className="container py-8">
            <BarChart2 className="w-12 h-12 mx-auto text-muted-foreground" />
            <div className="text-center text-base text-muted-foreground py-8">
                Τα στατιστικά δεν είναι ακόμη διαθέσιμα.
            </div>

        </div>
    }

    return (
        <div className="flex flex-col w-full p-6">
            <section className="w-full max-w-4xl mx-auto space-y-8">
                <div>
                    <h3 className="text-xl font-bold text-left mb-2">
                        <FileIcon className="w-4 h-4 inline-block mr-2" />
                        Κατηγορίες θεμάτων που συζητήθηκαν
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        Κατογορίες θεμάτων που συζητήθηκαν στη συνεδρίαση
                    </p>

                    <div className="bg-muted/50 rounded-lg p-4">
                        <div className="flex flex-wrap gap-2">
                            {sortedTopics.map((topicStat) => (
                                <TopicBadge topic={topicStat.topic} count={topicStat.count} key={topicStat.topic.id} />
                            ))}
                        </div>
                    </div>
                </div>

                <div>
                    <h3 className="text-xl font-bold text-left mb-2">
                        <PieChartIcon className="w-4 h-4 inline-block mr-2" />
                        Χρόνοι ομιλίας ανά παράταξη
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        Κατανομή χρόνου ομιλίας μεταξύ των παρατάξεων
                    </p>

                    <div className="bg-muted/50 rounded-lg p-4">
                        <ResponsiveContainer width="100%" height={400}>
                            <PieChart>
                                <Pie
                                    data={chartData}
                                    dataKey="minutes"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={80}
                                    outerRadius={120}
                                    fill="#8884d8"
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    labelLine={false}
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                    <Label
                                        position="center"
                                        content={() => (
                                            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                                                <tspan x="50%" dy="-0.5em" className="fill-foreground text-3xl font-bold">
                                                    {totalMinutes}
                                                </tspan>
                                                <tspan x="50%" dy="1.5em" className="fill-muted-foreground">
                                                    λεπτά
                                                </tspan>
                                            </text>
                                        )}
                                    />
                                </Pie>
                                <Tooltip formatter={(value, name) => [`${value} λεπτά`, name]} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div>
                    <h3 className="text-xl font-bold text-left mb-2">
                        <BarChartIcon className="w-4 h-4 inline-block mr-2" />
                        Χρόνοι ομιλίας ανά ομιλητή
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        Οι 10 ομιλητές με το μεγαλύτερο χρόνο ομιλίας
                    </p>

                    <div className="bg-muted/50 rounded-lg p-4">
                        <ResponsiveContainer width="100%" height={400}>
                            <ChartContainer config={chartConfig}>
                                <BarChart
                                    data={speakerChartData}
                                    layout="vertical"
                                    margin={{
                                        right: 16,
                                    }}
                                >
                                    <CartesianGrid horizontal={false} />
                                    <YAxis
                                        dataKey="name"
                                        type="category"
                                        tickLine={false}
                                        tickMargin={10}
                                        axisLine={false}
                                        hide
                                    />
                                    <XAxis dataKey="minutes" type="number" hide />
                                    <ChartTooltip
                                        cursor={false}
                                        content={<ChartTooltipContent indicator="line" />}
                                    />
                                    <Bar
                                        dataKey="minutes"
                                        fill="var(--color-desktop)"
                                        radius={4}
                                    >
                                        <LabelList
                                            dataKey="name"
                                            position="insideLeft"
                                            offset={8}
                                            className="fill-[--color-label]"
                                            fontSize={12}
                                        />
                                        <LabelList
                                            dataKey="minutes"
                                            position="right"
                                            offset={8}
                                            className="fill-foreground"
                                            fontSize={12}
                                        />
                                    </Bar>
                                </BarChart>
                            </ChartContainer>
                        </ResponsiveContainer>
                    </div>
                </div>
            </section>
        </div>
    )
}
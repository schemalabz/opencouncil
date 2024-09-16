"use client"

import { getStatisticsFor, StatisticsOfPerson, StatisticsOfParty } from "@/lib/statistics"
import { useEffect, useState, useMemo } from "react"
import { Cell, Label, Pie, PieChart, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from "recharts"
import TopicBadge from "./meetings/transcript/Topic"
import { ChartContainer, ChartConfig, ChartTooltipContent } from "@/components/ui/chart"
import { Loader2 } from "lucide-react"
import { useTranslations } from 'next-intl'
import NumberTicker from "./magicui/number-ticker"

type StatisticsProps = {
    type: 'person' | 'party'
    id: string
    cityId: string
}

export function Statistics({ type, id, cityId }: StatisticsProps) {
    const [statistics, setStatistics] = useState<StatisticsOfPerson | StatisticsOfParty | null>(null)
    const t = useTranslations('Statistics')

    useEffect(() => {
        const params = type === 'person' ? { personId: id, cityId } : { partyId: id, cityId }
        getStatisticsFor(params, ['topic', 'person', 'party']).then((s) => {
            setStatistics(s as StatisticsOfPerson | StatisticsOfParty)
        })
    }, [type, id, cityId])

    const topicChartData = useMemo(() => {
        if (!statistics || !statistics.topics) return []
        return statistics.topics.map(topic => ({
            name: topic.item.name,
            minutes: Math.round(topic.speakingSeconds / 60),
            count: topic.count
        }))
    }, [statistics])

    const speakerChartData = useMemo(() => {
        if (!statistics || !statistics.people) return []
        return statistics.people
            .sort((a, b) => b.speakingSeconds - a.speakingSeconds)
            .slice(0, 10)
            .map(person => ({
                name: person.item.name,
                minutes: Math.round(person.speakingSeconds / 60),
            }))
    }, [statistics])

    const totalSpeakingMinutes = useMemo(() => {
        if (!statistics) return 0
        return Math.round(statistics.speakingSeconds / 60)
    }, [statistics])

    const chartConfig: ChartConfig = {
        minutes: {
            label: t('minutes'),
            color: "hsl(var(--chart-1))",
        },
        label: {
            color: "hsl(var(--foreground))",
        },
    }

    if (!statistics) return (
        <div className="flex justify-center items-center w-full h-full">
            <Loader2 className="w-8 h-8 animate-spin" />
        </div>
    )

    return (
        <div className="flex flex-col items-center space-y-8">
            <div className="flex flex-col items-center">
                <NumberTicker value={totalSpeakingMinutes} className='text-3xl' />
                <span className="mt-2 text-lg font-medium">{t('totalMinutes')}</span>
            </div>
            <div className="w-full">
                <h3 className="text-lg font-medium mb-4">{t('topicsList')}</h3>
                <ul className="space-y-2">
                    {statistics.topics?.map((topicStat) => (
                        <TopicBadge key={topicStat.item.id} topic={topicStat.item} count={topicStat.count} />
                    ))}
                </ul>
            </div>
            {type === 'party' && 'people' in statistics && (
                <div className="w-full">
                    <h3 className="text-lg font-medium mb-4">{t('topSpeakers')}</h3>
                    <ResponsiveContainer width="100%" height={400}>
                        <ChartContainer config={chartConfig}>
                            <BarChart
                                data={speakerChartData}
                                layout="vertical"
                                margin={{
                                    right: 16,
                                }}
                            >
                                <CartesianGrid horizontal={false} stroke="hsl(var(--muted))" />
                                <YAxis dataKey="name" type="category" hide />
                                <XAxis type="number" hide />
                                <Tooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="minutes" fill="hsl(var(--primary))" radius={4}>
                                    <LabelList dataKey="name" position="insideLeft" fill="hsl(var(--background))" />
                                    <LabelList dataKey="minutes" position="right" fill="hsl(var(--foreground))" />
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    )
}
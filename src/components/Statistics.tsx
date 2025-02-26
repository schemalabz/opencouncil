"use client"

import { getStatisticsFor, StatisticsOfPerson, StatisticsOfParty } from "@/lib/statistics"
import { useEffect, useState, useMemo } from "react"
import { Cell, Label, Pie, PieChart, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from "recharts"
import TopicBadge from "./meetings/transcript/Topic"
import { ChartContainer, ChartConfig, ChartTooltipContent } from "@/components/ui/chart"
import { BarChart2, Loader2 } from "lucide-react"
import { useTranslations } from 'next-intl'
import NumberTicker from "./magicui/number-ticker"
import { Link, useRouter } from "@/i18n/routing"

type StatisticsProps = {
    type: 'person' | 'party'
    id: string
    cityId: string
    color?: string
    initialData?: StatisticsOfPerson | StatisticsOfParty
    administrativeBodyId?: string | null
    emptyStateMessage?: string
}

export function Statistics({ type, id, cityId, color, initialData, administrativeBodyId, emptyStateMessage }: StatisticsProps) {
    const [statistics, setStatistics] = useState<StatisticsOfPerson | StatisticsOfParty | null>(initialData || null)
    const [isLoading, setIsLoading] = useState<boolean>(!initialData)
    const t = useTranslations('Statistics')
    const router = useRouter()

    useEffect(() => {
        if (initialData) {
            setStatistics(initialData);
            setIsLoading(false);
        }
    }, [initialData]);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            const params = type === 'person'
                ? { personId: id, cityId, administrativeBodyId }
                : { partyId: id, cityId, administrativeBodyId }

            try {
                const data = await getStatisticsFor(params, ['topic', 'person', 'party']);
                setStatistics(data as StatisticsOfPerson | StatisticsOfParty);
            } catch (error) {
                console.error("Error fetching statistics:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [type, id, cityId, administrativeBodyId])

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
                id: person.item.id,
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
            color: color || "hsl(var(--chart-1))",
        },
        label: {
            color: "hsl(var(--foreground))",
        },
    }

    const barColor = color || "#D3D3D3"
    const textColor = color ?
        // If color provided, make text lighter/darker based on color brightness
        parseInt(barColor.replace('#', ''), 16) > 0xffffff / 2 ? '#000000' : '#ffffff'
        : "hsl(var(--foreground))"

    if (isLoading) {
        return (
            <div className="flex justify-center items-center w-full h-full min-h-[300px]">
                <Loader2 className="w-8 h-8 animate-spin" />
            </div>
        )
    }

    // Show empty state message if no statistics or total speaking minutes is 0
    if (!statistics || totalSpeakingMinutes === 0) {
        return (
            <div className="flex flex-col items-center justify-center w-full h-full min-h-[300px]">
                <BarChart2 className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-center text-muted-foreground">
                    {emptyStateMessage || t('noStatisticsAvailable', { fallback: 'Δεν υπάρχουν διαθέσιμα στατιστικά.' })}
                </p>
            </div>
        )
    }

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
                        <TopicBadge key={topicStat.item.id} topic={topicStat.item} count={topicStat.count} className="m-2" />
                    ))}
                </ul>
            </div>
            {type === 'party' && 'people' in statistics && statistics.people && statistics.people.length > 0 && (
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
                                <Bar dataKey="minutes" fill={barColor} radius={4} cursor="pointer" onClick={() => {
                                    router.push(`/${cityId}/people/${speakerChartData[0].id}`)
                                }}>
                                    <LabelList dataKey="name" position="insideLeft" fill={textColor} />
                                    <LabelList dataKey="minutes" position="right" fill={textColor} />
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    )
}
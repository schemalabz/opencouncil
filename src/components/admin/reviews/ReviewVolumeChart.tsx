"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartConfig, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from "recharts";
import { format, parseISO } from "date-fns";
import { Loader2, ChevronDown } from "lucide-react";
import { formatDurationMs } from "@/lib/formatters/time";

interface WeekData {
  week: string;
  reviewed: number;
  needsReview: number;
}

const chartConfig: ChartConfig = {
  reviewed: {
    label: "Reviewed",
    color: "hsl(var(--chart-2))",
  },
  needsReview: {
    label: "Needs Review",
    color: "hsl(var(--chart-1))",
  },
};

export function ReviewVolumeChart() {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<WeekData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Custom tooltip formatter - memoized to avoid recreating on each render
  const formatTooltipValue = useCallback((value: number | string) => {
    const numValue = typeof value === 'number' ? value : Number(value);
    return formatDurationMs(numValue);
  }, []);

  useEffect(() => {
    // Only fetch data when expanded and not already loaded
    if (isOpen && !hasLoaded) {
      const abortController = new AbortController();

      const fetchData = async () => {
        try {
          setIsLoading(true);
          setError(null);
          const response = await fetch("/api/admin/reviews/volume-chart", {
            signal: abortController.signal
          });
          if (!response.ok) {
            throw new Error("Failed to fetch chart data");
          }
          const result = await response.json();

          // Check if request was aborted
          if (!abortController.signal.aborted) {
            setData(result);
            setHasLoaded(true);
          }
        } catch (err) {
          // Don't set error if request was aborted
          if (err instanceof Error && err.name === 'AbortError') {
            return;
          }
          console.error("Error fetching volume chart data:", err);
          if (!abortController.signal.aborted) {
            setError(err instanceof Error ? err.message : "Failed to load chart data");
          }
        } finally {
          if (!abortController.signal.aborted) {
            setIsLoading(false);
          }
        }
      };

      fetchData();

      // Cleanup: abort fetch if component unmounts or dependencies change
      return () => {
        abortController.abort();
      };
    }
  }, [isOpen, hasLoaded]);

  // Format week labels for display - memoized to avoid recalculation
  const chartData = useMemo(() => {
    if (!hasLoaded) return [];
    return data.map((item) => ({
      ...item,
      weekLabel: format(parseISO(item.week), "MMM d"),
    }));
  }, [data, hasLoaded]);

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Review Volume (12 Weeks)</CardTitle>
                <CardDescription>Meeting time reviewed vs needs review</CardDescription>
              </div>
              <ChevronDown
                className={`h-5 w-5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""
                  }`}
              />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            {isLoading && (
              <div className="flex items-center justify-center h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            {error && !isLoading && (
              <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                <p>Error loading chart: {error}</p>
              </div>
            )}
            {!isLoading && !error && hasLoaded && (
              <ChartContainer config={chartConfig}>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="weekLabel"
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(value) => {
                        const hours = Math.floor(value / (1000 * 60 * 60));
                        return `${hours}h`;
                      }}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value) => formatTooltipValue(value as number | string)}
                          labelFormatter={(label) => `Week of ${label}`}
                        />
                      }
                    />
                    <Legend />
                    <Bar
                      dataKey="reviewed"
                      stackId="a"
                      fill="var(--color-reviewed)"
                      name="Reviewed"
                    />
                    <Bar
                      dataKey="needsReview"
                      stackId="a"
                      fill="var(--color-needsReview)"
                      name="Needs Review"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}


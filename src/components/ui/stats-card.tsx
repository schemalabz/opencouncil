import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReactNode } from "react";

/**
 * Interface for individual statistics items displayed in the StatsCard component.
 */
export interface StatsCardItem {
    /** The title of the statistic */
    title: string;
    /** The main value to display (number or string) */
    value: number | string;
    /** Optional icon to display in the header */
    icon?: ReactNode;
    /** Optional description text below the value */
    description?: string;
    /** Optional percentage to display next to the value */
    percent?: number;
    /** Optional trend indicator with percentage and direction */
    trend?: {
        value: number;
        isPositive: boolean;
    };
}

interface StatsCardProps {
    /** Array of statistics items to display */
    items: StatsCardItem[];
    /** Number of columns in the grid layout (1-6) */
    columns?: 1 | 2 | 3 | 4 | 5 | 6;
    /** Additional CSS classes */
    className?: string;
}

/**
 * A reusable UI component for displaying statistics in a consistent card-based layout.
 * 
 * This component is designed to replace the repetitive pattern of creating individual
 * Card components for displaying metrics. It provides a responsive grid layout with
 * consistent styling and supports various content types including icons, descriptions,
 * percentages, and trend indicators.
 * 
 * @example
 * ```tsx
 * import { StatsCard } from "@/components/ui/stats-card";
 * import { Users, TrendingUp } from "lucide-react";
 * 
 * const statsItems: StatsCardItem[] = [
 *   {
 *     title: "Total Users",
 *     value: 1234,
 *     icon: <Users className="h-4 w-4" />,
 *     description: "Registered users",
 *   },
 *   {
 *     title: "Active Users",
 *     value: 890,
 *     percent: 72.1,
 *     icon: <TrendingUp className="h-4 w-4" />,
 *     description: "Percentage of total users",
 *     trend: { value: 12.5, isPositive: true }
 *   },
 * ];
 * 
 * function MyComponent() {
 *   return <StatsCard items={statsItems} columns={2} />;
 * }
 * ```
 */
export function StatsCard({ items, columns = 3, className = "" }: StatsCardProps) {
    const gridCols = {
        1: "grid-cols-1",
        2: "grid-cols-1 md:grid-cols-2",
        3: "grid-cols-1 md:grid-cols-3",
        4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
        5: "grid-cols-1 md:grid-cols-2 lg:grid-cols-5",
        6: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
    };

    return (
        <div className={`grid gap-4 ${gridCols[columns]} mb-6 ${className}`}>
            {items.map((item) => (
                <Card key={item.title}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{item.title}</CardTitle>
                        {item.icon && (
                            <div className="text-muted-foreground rounded-full p-1">
                                {item.icon}
                            </div>
                        )}
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {item.value}
                            {item.percent !== undefined && (
                                <span className="text-sm font-normal text-muted-foreground ml-2">
                                    ({item.percent}%)
                                </span>
                            )}
                        </div>
                        {item.description && (
                            <p className="text-xs text-muted-foreground">{item.description}</p>
                        )}
                        {item.trend && (
                            <div className={`text-xs ${item.trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                                {item.trend.isPositive ? '+' : ''}{item.trend.value}%
                            </div>
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
} 
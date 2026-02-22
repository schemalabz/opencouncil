"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartConfig, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer } from "recharts";
import { useTranslations } from "next-intl";
import { BudgetComparison as BudgetComparisonType } from "@/types/budget";
import { generateBudgetComparison, MOCK_BUDGETS, MUNICIPALITY_POPULATIONS, calculatePerCapita } from "@/lib/mock-data/budgets";

/**
 * Color palette for municipalities
 */
const MUNICIPALITY_COLORS: Record<string, string> = {
  athens: "hsl(var(--chart-1))",
  thessaloniki: "hsl(var(--chart-2))",
  piraeus: "hsl(var(--chart-3))",
  patras: "hsl(var(--chart-4))",
  heraklion: "hsl(var(--chart-5))",
};

interface BudgetComparisonProps {
  /**
   * Optional pre-selected municipality IDs
   * Defaults to Athens and Thessaloniki
   */
  initialMunicipalities?: string[];
  
  /**
   * Year to display
   */
  year?: number;
  
  /**
   * Locale for translations (el or en)
   */
  locale?: "el" | "en";
}

/**
 * Budget Comparison Component
 * 
 * Displays comparative budget visualizations across multiple Greek municipalities.
 * Features:
 * - Side-by-side category comparison
 * - Per-capita spending normalization
 * - Interactive municipality selection
 * - Responsive design
 * - Bilingual support (Greek/English)
 */
export function BudgetComparison({
  initialMunicipalities = ["athens", "thessaloniki"],
  year = 2024,
  locale = "el",
}: BudgetComparisonProps) {
  const t = useTranslations("Budgets");
  const [selectedMunicipalities, setSelectedMunicipalities] = useState<string[]>(initialMunicipalities);
  const [viewMode, setViewMode] = useState<"absolute" | "perCapita">("absolute");

  // Generate comparison data
  const comparisonData = useMemo(
    () => generateBudgetComparison(selectedMunicipalities, year),
    [selectedMunicipalities, year]
  );

  // Prepare chart data
  const chartData = useMemo(() => {
    return comparisonData.categories.map((category) => {
      const dataPoint: Record<string, string | number> = {
        category: locale === "el" ? category.name : category.name_en,
        categoryCode: category.code,
      };

      selectedMunicipalities.forEach((munId: string) => {
        const amount = category.amounts[munId] || 0;
        dataPoint[munId] = viewMode === "perCapita" 
          ? calculatePerCapita(amount, munId) 
          : amount;
      });

      return dataPoint;
    });
  }, [comparisonData, selectedMunicipalities, viewMode, locale]);

  // Chart configuration
  const chartConfig: ChartConfig = useMemo(() => {
    const config: ChartConfig = {};
    selectedMunicipalities.forEach((munId: string) => {
      const municipality = comparisonData.municipalities.find((m) => m.id === munId);
      if (municipality) {
        config[munId] = {
          label: locale === "el" ? municipality.name : municipality.name_en,
          color: MUNICIPALITY_COLORS[munId] || "hsl(var(--chart-1))",
        };
      }
    });
    return config;
  }, [selectedMunicipalities, comparisonData, locale]);

  // Format currency for display
  const formatCurrency = (value: number) => {
    if (viewMode === "perCapita") {
      return `€${value.toFixed(0)}`;
    }
    return `€${(value / 1_000_000).toFixed(1)}M`;
  };

  // Calculate total expenditure for summary cards
  const totalExpenditures = useMemo(() => {
    return selectedMunicipalities.map((munId: string) => {
      const budget = MOCK_BUDGETS.find((b) => b.municipalityId === munId && b.year === year);
      return {
        municipalityId: munId,
        name: locale === "el" 
          ? budget?.municipalityName || munId 
          : budget?.municipalityName_en || munId,
        total: budget?.totalExpenditure || 0,
        population: MUNICIPALITY_POPULATIONS[munId],
      };
    });
  }, [selectedMunicipalities, year, locale]);

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {t("comparisonTitle")} {year}
          </h2>
          <p className="text-muted-foreground">
            {t("comparisonDescription")}
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("viewMode")}:</span>
          <Tabs value={viewMode} onValueChange={(v: string) => setViewMode(v as "absolute" | "perCapita")}>
            <TabsList>
              <TabsTrigger value="absolute">{t("absolute")}</TabsTrigger>
              <TabsTrigger value="perCapita">{t("perCapita")}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {totalExpenditures.map((item: { municipalityId: string; name: string; total: number; population: number | undefined }) => (
          <Card key={item.municipalityId}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{item.name}</CardTitle>
              <CardDescription>
                {t("totalExpenditure")} {year}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-2xl font-bold">
                  €{(item.total / 1_000_000).toFixed(1)}M
                </div>
                {item.population && (
                  <div className="text-xs text-muted-foreground">
                    {t("perCapita")}: €{calculatePerCapita(item.total, item.municipalityId).toFixed(0)}
                    <br />
                    {t("population")}: {item.population.toLocaleString()}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Comparison Chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t("categoryComparison")}</CardTitle>
          <CardDescription>
            {viewMode === "absolute" 
              ? t("categoryComparisonDescriptionAbsolute")
              : t("categoryComparisonDescriptionPerCapita")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig}>
            <ResponsiveContainer width="100%" height={400}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="category" 
                angle={-45}
                textAnchor="end"
                height={100}
                interval={0}
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                tickFormatter={formatCurrency}
                tick={{ fontSize: 12 }}
              />
              <ChartTooltip 
                content={
                  <ChartTooltipContent 
                    formatter={(value: unknown) => formatCurrency(value as number)}
                  />
                }
              />
              <Legend 
                wrapperStyle={{ paddingTop: "20px" }}
                iconType="rect"
              />
              {selectedMunicipalities.map((munId: string) => (
                <Bar
                  key={munId}
                  dataKey={munId}
                  fill={MUNICIPALITY_COLORS[munId] || "hsl(var(--chart-1))"}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Municipality Selection (for future interactivity) */}
      <Card>
        <CardHeader>
          <CardTitle>{t("selectMunicipalities")}</CardTitle>
          <CardDescription>{t("selectMunicipalitiesDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {MOCK_BUDGETS.filter((b) => b.year === year)
              .map((budget) => (
                <Badge
                  key={budget.municipalityId}
                  variant={selectedMunicipalities.includes(budget.municipalityId) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => {
                    setSelectedMunicipalities((prev: string[]) =>
                      prev.includes(budget.municipalityId)
                        ? prev.filter((id: string) => id !== budget.municipalityId)
                        : [...prev, budget.municipalityId]
                    );
                  }}
                >
                  {locale === "el" ? budget.municipalityName : budget.municipalityName_en}
                </Badge>
              ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {t("selectionHint")}
          </p>
        </CardContent>
      </Card>

      {/* Data Source Attribution */}
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">
            <strong>{t("note")}:</strong> {t("mockDataDisclaimer")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

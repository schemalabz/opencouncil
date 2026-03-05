import React from "react";
import { render, screen } from "@testing-library/react";
import { GrowthTrendChart } from "../GrowthTrendChart";

// Mock recharts - renders nothing but doesn't crash
jest.mock("recharts", () => ({
    AreaChart: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("div", { "data-testid": "area-chart" }, children),
    Area: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("div", null, children),
}));

// Mock ChartContainer
jest.mock("@/components/ui/chart", () => ({
    ChartContainer: ({ children }: { children?: React.ReactNode }) =>
        React.createElement("div", { "data-testid": "chart-container" }, children),
    ChartTooltip: () => null,
    ChartTooltipContent: () => null,
}));

describe("GrowthTrendChart", () => {
    const sampleData = [
        { month: "2023-01", meetingCount: 4, totalSeconds: 14400 },
        { month: "2023-02", meetingCount: 6, totalSeconds: 21600 },
        { month: "2023-03", meetingCount: 8, totalSeconds: 28800 },
    ];

    it("renders with sample monthly data", () => {
        render(<GrowthTrendChart data={sampleData} />);
        expect(screen.getByTestId("growth-trend-chart")).toBeDefined();
    });

    it("renders the section heading", () => {
        render(<GrowthTrendChart data={sampleData} />);
        expect(screen.getByText("Μηνιαία Εξέλιξη")).toBeDefined();
    });

    it("renders chart container", () => {
        render(<GrowthTrendChart data={sampleData} />);
        expect(screen.getByTestId("chart-container")).toBeDefined();
    });
});

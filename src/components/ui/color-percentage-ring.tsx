"use client";

import React from 'react';

interface ColorPercentage {
    color: string;
    percentage: number;
}

export interface ColorPercentageRingProps {
    data: ColorPercentage[];
    size?: number;
    thickness?: number;
    children?: React.ReactNode;
    emptyColor?: string;
}

export const ColorPercentageRing: React.FC<ColorPercentageRingProps> = ({
    data,
    size = 100,
    thickness = 10,
    children,
    emptyColor = '#e5e7eb' // Default gray color for empty space
}) => {
    const radius = size / 2;
    let startAngle = 0;

    // Calculate total percentage
    const totalPercentage = data.reduce((sum, item) => sum + item.percentage, 0);

    // Create a copy of data with sorted percentages (largest first) for better visual appearance
    const sortedData = [...data].sort((a, b) => b.percentage - a.percentage);

    // Add remaining percentage if total is less than 100
    const dataWithEmpty = totalPercentage < 100
        ? [...sortedData, { color: emptyColor, percentage: 100 - totalPercentage }]
        : sortedData;

    return (
        <div className="relative inline-block">
            <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                className="transform -rotate-90" // Start from top instead of right
            >
                {/* Background circle */}
                <path
                    d={describeArc(
                        radius,
                        radius,
                        radius,
                        0,
                        360,
                        thickness
                    )}
                    fill="#f3f4f6" // Lighter background
                    className="transition-colors"
                />

                {dataWithEmpty.map((item, index) => {
                    const endAngle = startAngle + (item.percentage / 100) * 360;
                    const path = describeArc(
                        radius,
                        radius,
                        radius,
                        startAngle,
                        endAngle,
                        thickness
                    );
                    const currentStartAngle = startAngle;
                    startAngle = endAngle;

                    return (
                        <path
                            key={index}
                            d={path}
                            fill={item.color}
                            className="transition-all duration-300 ease-in-out"
                            // Optional: Add hover effect with title
                            {...(item.color !== emptyColor && {
                                onMouseEnter: (e) => {
                                    const path = e.target as SVGPathElement;
                                    path.style.opacity = '0.8';
                                },
                                onMouseLeave: (e) => {
                                    const path = e.target as SVGPathElement;
                                    path.style.opacity = '1';
                                }
                            })}
                        >
                            {/* Optional: Add title for accessibility */}
                            <title>
                                {item.color === emptyColor
                                    ? `Remaining: ${item.percentage.toFixed(1)}%`
                                    : `${item.percentage.toFixed(1)}%`
                                }
                            </title>
                        </path>
                    );
                })}
            </svg>
            {children && (
                <div className="absolute inset-0 flex items-center justify-center">
                    {children}
                </div>
            )}
        </div>
    );
};

function describeArc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    thickness: number
): string {
    const innerStart = polarToCartesian(x, y, radius - thickness, endAngle);
    const innerEnd = polarToCartesian(x, y, radius - thickness, startAngle);
    const outerStart = polarToCartesian(x, y, radius, endAngle);
    const outerEnd = polarToCartesian(x, y, radius, startAngle);

    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

    return [
        "M", innerStart.x, innerStart.y,
        "A", radius - thickness, radius - thickness, 0, largeArcFlag, 0, innerEnd.x, innerEnd.y,
        "L", outerEnd.x, outerEnd.y,
        "A", radius, radius, 0, largeArcFlag, 1, outerStart.x, outerStart.y,
        "L", innerStart.x, innerStart.y,
        "Z"
    ].join(" ");
}

function polarToCartesian(
    centerX: number,
    centerY: number,
    radius: number,
    angleInDegrees: number
): { x: number; y: number } {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
        x: centerX + (radius * Math.cos(angleInRadians)),
        y: centerY + (radius * Math.sin(angleInRadians))
    };
}


import React from 'react';

interface ColorPercentage {
    color: string;
    percentage: number;
}

interface ColorPercentageRingProps {
    data: ColorPercentage[];
    size?: number;
    thickness?: number;
    children?: React.ReactNode;
}

export const ColorPercentageRing: React.FC<ColorPercentageRingProps> = ({
    data,
    size = 100,
    thickness = 10,
    children
}) => {
    const radius = size / 2;
    let startAngle = 0;

    return (
        <div className="relative inline-block">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                {data.map((item, index) => {
                    const endAngle = startAngle + (item.percentage / 100) * 360;
                    const path = describeArc(radius, radius, radius, startAngle, endAngle, thickness);
                    startAngle = endAngle;
                    return <path key={index} d={path} fill={item.color} />;
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

function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number, thickness: number): string {
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

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
        x: centerX + (radius * Math.cos(angleInRadians)),
        y: centerY + (radius * Math.sin(angleInRadians))
    };
}


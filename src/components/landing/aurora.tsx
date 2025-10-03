"use client";
import { cn } from "@/lib/utils";
import React, { ReactNode } from "react";

interface AuroraBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
    children?: ReactNode;
    showRadialGradient?: boolean;
}

export default function Aurora({
    className,
    children,
    showRadialGradient = false,
    ...props
}: AuroraBackgroundProps) {
    return (
        <div
            className={cn(
                "absolute inset-0 overflow-hidden bg-white",
                className,
            )}
            {...props}
        >
            <div
                className="absolute inset-0 overflow-hidden"
                style={
                    {
                        "--orange": "#fc550a",
                        "--blue": "#a4c0e1",
                        "--light-orange": "#ff8c52",
                        "--light-blue": "#c5d9f0",
                        "--pale-orange": "#ffc9a8",
                        "--white": "#fff",
                        "--transparent": "transparent",
                    } as React.CSSProperties
                }
            >
                <div
                    className={cn(
                        `after:animate-aurora pointer-events-none absolute -inset-[10px] opacity-50 blur-[60px] invert filter will-change-transform`,
                        `[background-image:var(--white-gradient),var(--aurora)]`,
                        `[background-size:300%,_200%]`,
                        `[background-position:50%_50%,50%_50%]`,
                        `[--aurora:repeating-linear-gradient(100deg,var(--orange)_10%,var(--light-blue)_15%,var(--blue)_20%,var(--light-orange)_25%,var(--orange)_30%)]`,
                        `[--white-gradient:repeating-linear-gradient(100deg,var(--white)_0%,var(--white)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--white)_16%)]`,
                        `after:absolute after:inset-0 after:mix-blend-difference after:content-[""]`,
                        `after:[background-image:var(--white-gradient),var(--aurora)]`,
                        `after:[background-size:200%,_100%]`,
                        `after:[background-attachment:fixed]`,
                        `[mask-image:radial-gradient(ellipse_at_100%_0%,black_10%,var(--transparent)_70%)]`,
                    )}
                ></div>
            </div>
            {children}
        </div>
    );
}

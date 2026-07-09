import React from "react"
import { LandingScrollLock } from "@/components/landing/v2/LandingScrollLock";

export default function LandingImmersiveLayout({
    children,
}: {
    children: React.ReactNode,
}) {
    return (
        <>
            <LandingScrollLock />
            {children}
        </>
    );
}

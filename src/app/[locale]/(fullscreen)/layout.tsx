import React from "react"
import { Toaster } from "@/components/ui/toaster";

export default async function FullscreenLayout({
    children,
}: {
    children: React.ReactNode,
}) {

    return (
        <>
            {children}
            <Toaster />
        </>
    );
}


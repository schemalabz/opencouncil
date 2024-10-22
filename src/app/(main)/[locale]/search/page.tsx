"use server";
import { default as SearchPageComponent } from "@/components/search/SearchPage";
import { unstable_setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

export default async function SearchPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    unstable_setRequestLocale(locale);
    return <Suspense fallback={<div>Loading...</div>}>
        <SearchPageComponent />
    </Suspense>
}
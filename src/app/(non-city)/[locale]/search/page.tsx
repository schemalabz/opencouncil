"use server";
import { default as SearchPageComponent } from "@/components/search/SearchPage";
import { unstable_setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

export default async function SearchPage({ params: { locale } }: { params: { locale: string } }) {
    unstable_setRequestLocale(locale);
    return <Suspense fallback={<div>Loading...</div>}>
        <SearchPageComponent />
    </Suspense>
}
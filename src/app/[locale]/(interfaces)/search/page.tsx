"use server";
import { default as SearchPageComponent } from "@/components/search/SearchPage";
import { Suspense } from "react";

export default async function SearchPage({ params: { locale } }: { params: { locale: string } }) {
    return <Suspense fallback={<div>Loading...</div>}>
        <SearchPageComponent />
    </Suspense>
}
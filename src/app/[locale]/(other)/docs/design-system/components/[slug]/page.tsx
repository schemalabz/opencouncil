// components/[slug]/page.tsx
import { notFound } from 'next/navigation';
import { getEntries, getEntry } from '../../_registry';
import { ComponentDoc } from '../../ComponentDoc';

export function generateStaticParams() {
    return getEntries('components').map((e) => ({ slug: e.slug }));
}

export default async function ComponentDetail({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const entry = getEntry('components', slug);
    if (!entry) notFound();
    return (
        <ComponentDoc name={entry.name} sourcePath={entry.sourcePath} description={entry.description} dos={entry.dos} donts={entry.donts} code={entry.code} imports={entry.imports}>
            {entry.sample}
        </ComponentDoc>
    );
}

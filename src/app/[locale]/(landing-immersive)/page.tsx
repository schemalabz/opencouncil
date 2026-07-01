import { Metadata } from 'next';
import { LandingV2 } from '@/components/landing/v2/LandingV2';
import { buildHreflangAlternates } from '@/lib/utils/hreflang';

export async function generateMetadata(props: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await props.params;
    return {
        alternates: await buildHreflangAlternates('', locale),
    };
}

export default function HomePage() {
    return <LandingV2 />;
}

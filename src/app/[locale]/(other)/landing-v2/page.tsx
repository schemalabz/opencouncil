import { LandingV2 } from '@/components/landing/v2/LandingV2';

/**
 * Preview route for the landing redesign (issue #208), kept separate from the
 * live landing at /(other)/page.tsx so the current page stays untouched while we
 * iterate. Visit /landing-v2 to see it.
 */
export default function LandingV2PreviewPage() {
    return <LandingV2 />;
}

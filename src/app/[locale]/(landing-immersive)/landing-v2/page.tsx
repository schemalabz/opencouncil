import { LandingV2 } from '@/components/landing/v2/LandingV2';

/**
 * Landing redesign preview (issue #208) — the consolidated direction: split-screen
 * map + tabbed Θέματα/Δήμοι panel on desktop, immersive map-first layout on mobile.
 * Lives in the (landing-immersive) route group so it renders without the global site
 * Header/Footer (the page provides its own chrome). The live landing at
 * /(other)/page.tsx stays untouched. Visit /landing-v2 to see it.
 */
export default function LandingV2PreviewPage() {
    return <LandingV2 />;
}

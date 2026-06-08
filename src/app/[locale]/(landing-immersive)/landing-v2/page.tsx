import { ConceptA } from '@/components/landing/v2/ConceptA';

/**
 * Landing redesign preview (issue #208) — Concept A, the immersive map-first
 * "map-app" direction. Lives in the (landing-immersive) route group so it renders
 * without the global site Header/Footer (the page provides its own chrome). The
 * live landing at /(other)/page.tsx stays untouched. Visit /landing-v2 to see it.
 */
export default function LandingV2PreviewPage() {
    return <ConceptA />;
}

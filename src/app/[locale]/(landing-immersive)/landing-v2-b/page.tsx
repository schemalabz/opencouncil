import { ConceptB } from '@/components/landing/v2/ConceptB';

/**
 * Landing redesign preview (issue #208) — Concept B, the editorial map hero + scroll
 * direction. Lives in the (landing-immersive) route group so it renders without the
 * global site Header/Footer (the page provides its own nav + footer). Visit
 * /landing-v2-b to see it.
 */
export default function LandingV2BPreviewPage() {
    return <ConceptB />;
}

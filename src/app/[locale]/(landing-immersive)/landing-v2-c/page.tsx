import { ConceptC } from '@/components/landing/v2/ConceptC';

/**
 * Landing redesign preview (issue #208) — Concept C, the split-screen map + synced
 * list direction (desktop) with a Λίστα / Χάρτης toggle on mobile. Lives in the
 * (landing-immersive) route group so it renders without the global site Header/Footer.
 * Visit /landing-v2-c to see it.
 */
export default function LandingV2CPreviewPage() {
    return <ConceptC />;
}

'use client';

import { useEffect, useRef, type MutableRefObject, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider, useLocale, useMessages, type AbstractIntlMessages } from 'next-intl';
import mapboxgl, { type Map as MapboxMap } from 'mapbox-gl';
import { EXPLAIN_LNGLAT, flyToMunicipality } from '@/lib/landing/landingCore';
import type { ClickedMunicipality, LandingSubject } from '@/lib/landing/landingData';
import { DesktopSubjectTooltip, ExplainTooltip, MunicipalityTooltip } from '../mapMarkers';

/**
 * Render `node` into a detached container via createRoot, wrapped in the next-intl provider —
 * popups/markers live outside React's tree, so they need their own provider for useTranslations.
 * Returns the container (popup DOM content) and root (to unmount on teardown).
 */
function renderIntlRoot(
    intl: { locale: string; messages: AbstractIntlMessages },
    node: ReactNode,
): { container: HTMLDivElement; root: ReturnType<typeof createRoot> } {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(
        <NextIntlClientProvider locale={intl.locale} messages={intl.messages}>
            {node}
        </NextIntlClientProvider>,
    );
    return { container, root };
}

/**
 * Map overlays rendered as Mapbox popups / DOM markers (outside React's tree, so navigation
 * goes through the `navigate` callback). Covers: the desktop subject tooltip, the OpenCouncil
 * badge and its popup, "selecting a subject closes the other previews", the click that shades
 * an out-of-network δήμος, and that δήμος's "request it" popup.
 */
export function useMapPopups({
    mapInstance,
    isMobile,
    selectedId,
    selectedSubject,
    clickedMunicipality,
    showExplainMarker,
    navigate,
    onClearSelection,
    onShowExplainLocation,
    setExplainOpen,
    setClickedMunicipality,
    setGeneralBox,
    closeExplainPopupRef,
}: {
    mapInstance: MapboxMap | null;
    isMobile: boolean;
    selectedId: string | null;
    selectedSubject: LandingSubject | null;
    clickedMunicipality: ClickedMunicipality | null;
    /** whether the OpenCouncil office badge is shown — hidden when zoomed out, where it would just
     *  stack onto Athens' cluster number */
    showExplainMarker: boolean;
    /** navigate to a path (router.push) — popups have no router context of their own */
    navigate: (path: string) => void;
    onClearSelection: () => void;
    onShowExplainLocation: () => void;
    setExplainOpen: (v: boolean) => void;
    setClickedMunicipality: (v: ClickedMunicipality | null) => void;
    setGeneralBox: (v: null) => void;
    /** set by the badge effect so other effects/markers can close the OpenCouncil popup */
    closeExplainPopupRef: MutableRefObject<(() => void) | null>;
}) {
    // Latest-value refs so the popup effects don't re-run and rebuild popups on every render.
    const navigateRef = useRef(navigate);
    navigateRef.current = navigate;
    const clearSelectionRef = useRef(onClearSelection);
    clearSelectionRef.current = onClearSelection;
    const showExplainLocationRef = useRef(onShowExplainLocation);
    showExplainLocationRef.current = onShowExplainLocation;
    const isMobileRef = useRef(isMobile);
    isMobileRef.current = isMobile;
    // A monotonic token for the map-click municipality lookup. The fetch is async, so a later click
    // — or a subject selection landing before it resolves — bumps this; the stale response then sees
    // its token is no longer current and drops its result instead of re-opening a box over whatever
    // took its place.
    const mapClickSeq = useRef(0);
    const subjectPopupRef = useRef<mapboxgl.Popup | null>(null);
    const subjectPopupRootRef = useRef<ReturnType<typeof createRoot> | null>(null);
    // Tooltips render outside React's tree, so messages/locale are ref'd to re-wrap them in a
    // provider without re-running the popup effects each render.
    const messages = useMessages();
    const locale = useLocale();
    const intlRef = useRef({ messages, locale });
    intlRef.current = { messages, locale };

    // Desktop-only floating tooltip above the selected subject's pin (mobile uses its own
    // bottom preview). A Mapbox popup, so it tracks the pin as the map moves.
    useEffect(() => {
        if (!mapInstance) return;
        const cleanup = () => {
            const root = subjectPopupRootRef.current;
            subjectPopupRootRef.current = null;
            // unmount async — React forbids unmounting a root mid-commit
            if (root) setTimeout(() => root.unmount(), 0);
            subjectPopupRef.current?.remove();
            subjectPopupRef.current = null;
        };
        cleanup();
        if (isMobile || !selectedSubject) return cleanup;

        const subject = selectedSubject;
        const { container, root } = renderIntlRoot(
            intlRef.current,
            <DesktopSubjectTooltip
                subject={subject}
                onView={() => navigateRef.current(subject.href)}
                onClose={() => clearSelectionRef.current()}
            />,
        );
        const popup = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
            anchor: 'bottom',
            offset: 24,
            className: 'subject-popup',
            maxWidth: 'none',
        })
            .setLngLat([subject.lng, subject.lat])
            .setDOMContent(container)
            .addTo(mapInstance);
        subjectPopupRef.current = popup;
        subjectPopupRootRef.current = root;
        return cleanup;
    }, [mapInstance, selectedSubject, isMobile]);

    // OpenCouncil badge — a white logo circle at the info card's location. Clicking it opens a
    // tooltip linking to /explain. Hidden while zoomed out, where it would only pile onto the Athens
    // cluster number.
    useEffect(() => {
        if (!mapInstance || !showExplainMarker) return;
        let popup: mapboxgl.Popup | null = null;
        let root: ReturnType<typeof createRoot> | null = null;
        const teardownPopup = () => {
            if (root) {
                const r = root;
                root = null;
                // unmount async — React forbids unmounting a root mid-commit
                setTimeout(() => r.unmount(), 0);
            }
            if (popup) {
                const p = popup;
                popup = null;
                p.remove();
            }
        };
        closeExplainPopupRef.current = teardownPopup;
        const togglePopup = () => {
            if (popup) {
                teardownPopup();
                return;
            }
            // Opening the OpenCouncil popup deselects any subject / clicked municipality.
            clearSelectionRef.current();
            setClickedMunicipality(null);
            const rendered = renderIntlRoot(
                intlRef.current,
                <ExplainTooltip onView={() => navigateRef.current('/explain')} onClose={teardownPopup} />,
            );
            const container = rendered.container;
            root = rendered.root;
            popup = new mapboxgl.Popup({
                closeButton: false,
                closeOnClick: true,
                anchor: 'bottom',
                offset: 24,
                className: 'subject-popup',
                maxWidth: 'none',
            })
                .setLngLat(EXPLAIN_LNGLAT)
                .setDOMContent(container)
                .addTo(mapInstance);
            popup.on('close', teardownPopup);
        };
        const el = document.createElement('div');
        el.className =
            'flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-2 border-[hsl(var(--orange))] bg-white shadow-md transition-transform hover:scale-110';
        const img = document.createElement('img');
        img.src = '/logo.png';
        img.alt = 'OpenCouncil';
        img.className = 'h-6 w-6 object-contain';
        el.appendChild(img);
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            showExplainLocationRef.current();
            if (isMobileRef.current) {
                // Mobile: show the card preview, not a map tooltip.
                clearSelectionRef.current();
                setExplainOpen(true);
            } else {
                togglePopup();
            }
        });
        const marker = new mapboxgl.Marker({ element: el }).setLngLat(EXPLAIN_LNGLAT).addTo(mapInstance);
        return () => {
            teardownPopup();
            closeExplainPopupRef.current = null;
            marker.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapInstance, showExplainMarker]);

    // Selecting any subject closes the OpenCouncil preview (desktop popup or mobile card)
    // and the clicked-municipality preview.
    useEffect(() => {
        if (selectedId) {
            // Invalidate any in-flight map-click lookup so its late response can't re-open a
            // municipality box on top of the subject just selected.
            mapClickSeq.current++;
            closeExplainPopupRef.current?.();
            setExplainOpen(false);
            setClickedMunicipality(null);
            setGeneralBox(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId]);

    // Clicking the map dismisses whatever preview is open (selected subject, OpenCouncil card) and
    // looks up the municipality there; an out-of-network δήμος gets shaded and shows a "request it"
    // preview.
    useEffect(() => {
        if (!mapInstance) return;
        const onClick = (e: mapboxgl.MapMouseEvent) => {
            const { lng, lat } = e.lngLat;
            // Clicking the map background is a dismissal, whatever is underneath: drop the selected
            // subject and the OC preview up front rather than inside the branch below, so it happens
            // on the click instead of a network round-trip later. Marker and popup clicks never get
            // here — they land on their own DOM elements, not the canvas.
            clearSelectionRef.current();
            closeExplainPopupRef.current?.();
            setExplainOpen(false);
            const seq = ++mapClickSeq.current;
            fetch(`/api/cities/at?lng=${lng}&lat=${lat}`)
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null)
                .then((city: { id: string; name: string; officialSupport: boolean; geometry: GeoJSON.Geometry } | null) => {
                    // A newer click or a subject selection superseded this lookup — drop it.
                    if (seq !== mapClickSeq.current) return;
                    if (city && city.officialSupport === false && city.geometry) {
                        // out-of-network δήμος → make it the focus
                        setClickedMunicipality({ id: city.id, name: city.name, geometry: city.geometry, lng, lat });
                        flyToMunicipality(mapInstance, city.geometry, isMobileRef.current);
                    } else {
                        setClickedMunicipality(null);
                    }
                });
        };
        mapInstance.on('click', onClick);
        return () => {
            mapInstance.off('click', onClick);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapInstance]);

    // Preview popup over a clicked out-of-network municipality — "request it" with a petition link.
    useEffect(() => {
        if (!mapInstance || !clickedMunicipality) return;
        const { container, root } = renderIntlRoot(
            intlRef.current,
            <MunicipalityTooltip
                name={clickedMunicipality.name}
                onView={() => navigateRef.current('/petition')}
                onClose={() => setClickedMunicipality(null)}
            />,
        );
        const popup = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
            anchor: 'bottom',
            offset: 16,
            className: 'subject-popup',
            maxWidth: 'none',
        })
            .setLngLat([clickedMunicipality.lng, clickedMunicipality.lat])
            .setDOMContent(container)
            .addTo(mapInstance);
        return () => {
            // unmount async — React forbids unmounting a root mid-commit
            setTimeout(() => root.unmount(), 0);
            popup.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapInstance, clickedMunicipality]);
}

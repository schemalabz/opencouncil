'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider, useLocale, useMessages } from 'next-intl';
import mapboxgl, { type Map as MapboxMap } from 'mapbox-gl';
import { EXPLAIN_LNGLAT, flyToMunicipality } from '../landingCore';
import type { ClickedMunicipality, LandingSubject } from '../landingData';
import { DesktopSubjectTooltip, ExplainTooltip, MunicipalityTooltip } from '../mapMarkers';

/**
 * All map overlays rendered as Mapbox popups / DOM markers (each via createRoot, outside
 * React's tree, so navigation goes through the `navigate` callback rather than router
 * context). Covers: the desktop subject tooltip, the persistent OpenCouncil badge and its
 * popup, the "selecting a subject closes the other previews" rule, the click that shades an
 * out-of-network δήμος, and that δήμος's "request it" popup.
 */
export function useMapPopups({
    mapInstance,
    isMobile,
    selectedId,
    selectedSubject,
    clickedMunicipality,
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
    // Stable "latest value" refs for callbacks/values the popup effects must not depend on
    // (so they don't re-run and rebuild the popups on every render).
    const navigateRef = useRef(navigate);
    navigateRef.current = navigate;
    const clearSelectionRef = useRef(onClearSelection);
    clearSelectionRef.current = onClearSelection;
    const showExplainLocationRef = useRef(onShowExplainLocation);
    showExplainLocationRef.current = onShowExplainLocation;
    const isMobileRef = useRef(isMobile);
    isMobileRef.current = isMobile;
    const subjectPopupRef = useRef<mapboxgl.Popup | null>(null);
    const subjectPopupRootRef = useRef<ReturnType<typeof createRoot> | null>(null);
    // The tooltips render via createRoot, OUTSIDE React's tree — so they're outside the
    // next-intl provider too. Re-wrap each render in a provider (messages/locale ref'd so the
    // popup effects don't re-run on every render) so useTranslations works inside them.
    const messages = useMessages();
    const locale = useLocale();
    const intlRef = useRef({ messages, locale });
    intlRef.current = { messages, locale };

    // Desktop-only floating tooltip above the selected subject's pin (mobile keeps its own
    // bottom preview). It's a Mapbox popup, so it tracks the pin as the map moves.
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
        const container = document.createElement('div');
        const root = createRoot(container);
        root.render(
            <NextIntlClientProvider locale={intlRef.current.locale} messages={intlRef.current.messages}>
                <DesktopSubjectTooltip
                    subject={subject}
                    onView={() => navigateRef.current(subject.href)}
                    onClose={() => clearSelectionRef.current()}
                />
            </NextIntlClientProvider>,
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

    // Persistent OpenCouncil badge on the map — a white circle with our logo at the info
    // card's location. Clicking it opens a tooltip (like a subject) linking to /explain.
    useEffect(() => {
        if (!mapInstance) return;
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
            const container = document.createElement('div');
            root = createRoot(container);
            root.render(
                <NextIntlClientProvider locale={intlRef.current.locale} messages={intlRef.current.messages}>
                    <ExplainTooltip onView={() => navigateRef.current('/explain')} onClose={teardownPopup} />
                </NextIntlClientProvider>,
            );
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
            // bring the location to center, like the other location previews
            showExplainLocationRef.current();
            if (isMobileRef.current) {
                // Mobile: show the card preview (like a subject), not a map tooltip.
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
    }, [mapInstance]);

    // Selecting any subject closes the OpenCouncil preview (desktop popup or mobile card)
    // and the clicked-municipality preview.
    useEffect(() => {
        if (selectedId) {
            closeExplainPopupRef.current?.();
            setExplainOpen(false);
            setClickedMunicipality(null);
            setGeneralBox(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId]);

    // Clicking the map looks up the municipality at that point; an out-of-network δήμος gets
    // shaded orange and shows a "request it" preview. Clicking a supported area or outside
    // any municipality clears it. A map click also dismisses subject/OC previews.
    useEffect(() => {
        if (!mapInstance) return;
        const onClick = (e: mapboxgl.MapMouseEvent) => {
            const { lng, lat } = e.lngLat;
            fetch(`/api/cities/at?lng=${lng}&lat=${lat}`)
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null)
                .then((city: { id: string; name: string; officialSupport: boolean; geometry: GeoJSON.Geometry } | null) => {
                    if (city && city.officialSupport === false && city.geometry) {
                        // out-of-network δήμος → make it the focus, dismiss other previews
                        clearSelectionRef.current();
                        closeExplainPopupRef.current?.();
                        setExplainOpen(false);
                        setClickedMunicipality({ id: city.id, name: city.name, geometry: city.geometry, lng, lat });
                        // center it at ~2/3 of the width (right of the floating list) on desktop
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

    // Preview popup over a clicked out-of-network municipality — "not in OpenCouncil yet,
    // request it" with a petition link. Shown on both desktop and mobile.
    useEffect(() => {
        if (!mapInstance || !clickedMunicipality) return;
        const container = document.createElement('div');
        const root = createRoot(container);
        root.render(
            <NextIntlClientProvider locale={intlRef.current.locale} messages={intlRef.current.messages}>
                <MunicipalityTooltip
                    name={clickedMunicipality.name}
                    onView={() => navigateRef.current('/petition')}
                    onClose={() => setClickedMunicipality(null)}
                />
            </NextIntlClientProvider>,
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

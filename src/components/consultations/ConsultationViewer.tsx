"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { Realm } from "@prisma/client";
import type { CityWithGeometry } from "@/lib/db/cities";
import type { ConsultationCommentWithUpvotes, ConsultationWithStatus } from "@/lib/db/consultations";
import { formatClockTime, formatDate } from "@/lib/formatters/time";
import type { Location } from "@/lib/types/onboarding";
import ConsultationBar from "./ConsultationBar";
import ConsultationMap from "./ConsultationMap";
import { computeAddressLookup } from "./addressLookup";
import { captureConsultationAddressSearched, captureConsultationEntityOpened, type ConsultationEntityOpenSource } from "./analytics";
import {
    buildConsultationUrl,
    getConsultationViewForEntityType,
    resolveConsultationEntityType,
    resolveConsultationUrlState,
    type ConsultationView,
} from "./consultationUrl";
import { describeEntity, extractGeoSets, findExplainingCard } from "./entityDisplay";
import type { CurrentUser, RegulationData } from "./types";
import CommentsView from "./views/CommentsView";
import CommentView from "./views/CommentView";
import HomeView from "./views/HomeView";
import MiniMap from "./views/MiniMap";
import PlaceView from "./views/PlaceView";
import PlanView from "./views/PlanView";
import StreetView from "./views/StreetView";
import StudyView from "./views/StudyView";
import { navigateTo, ViewLink } from "./views/ui";

interface ConsultationViewerProps {
    /** The site's header. It tops every screen but the phone's full-screen map. */
    header?: ReactNode;
    consultation: ConsultationWithStatus;
    regulationData: RegulationData | null;
    comments: ConsultationCommentWithUpvotes[];
    currentUser?: CurrentUser;
    consultationId: string;
    cityId: string;
    /** the request's realm, resolved server-side — picks the support phone number */
    realm: Realm;
    /** "Δήμος Χ" as written by the city */
    municipalityName?: string;
    cityLogoUrl?: string | null;
}

interface Place {
    view: ConsultationView;
    entityId: string | null;
}

/** The computer layout (map beside a panel) starts where the side panel leaves the map enough room. */
const DESKTOP_QUERY = '(min-width: 1024px)';

/** `null` until mounted: the server cannot know the screen, and the map must mount only once. */
function useIsDesktop(): boolean | null {
    const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
    useEffect(() => {
        const media = window.matchMedia(DESKTOP_QUERY);
        const update = () => setIsDesktop(media.matches);
        update();
        media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
    }, []);
    return isDesktop;
}

/** The height of an element, kept current; the phone's map keeps its zooms clear of the place card. */
function useElementHeight(): [(element: HTMLElement | null) => void, number] {
    const [height, setHeight] = useState(0);
    const observer = useRef<ResizeObserver | null>(null);
    const ref = useCallback((element: HTMLElement | null) => {
        observer.current?.disconnect();
        if (!element) {
            setHeight(0);
            return;
        }
        observer.current = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
        observer.current.observe(element);
    }, []);
    return [ref, height];
}

function isLocation(value: unknown): value is Location {
    if (!value || typeof value !== 'object') return false;
    const { text, coordinates } = value as Partial<Location>;
    return typeof text === 'string'
        && Array.isArray(coordinates) && coordinates.length === 2
        && coordinates.every(n => typeof n === 'number' && Number.isFinite(n));
}

const href = (view: ConsultationView, entityId?: string | null) => buildConsultationUrl('', { view, entityId });

/**
 * A consultation as a few plain screens: where do you live, what changes on your street, the map,
 * the comment form, the plan in two minutes, what others said, and the full study. The screen is
 * the URL's `view` (with `entity` for a place or a section); the reader's address stays in this tab.
 */
export default function ConsultationViewer({
    header,
    consultation,
    regulationData,
    comments,
    currentUser,
    consultationId,
    cityId,
    realm,
    municipalityName,
    cityLogoUrl,
}: ConsultationViewerProps) {
    const searchParams = useSearchParams();
    const isDesktop = useIsDesktop();

    const hasGuide = !!(regulationData?.addressLookup || regulationData?.overview?.length);
    const defaultView: ConsultationView = hasGuide ? 'home' : (regulationData?.defaultView ?? 'document');
    const urlState = useMemo(
        () => resolveConsultationUrlState({ pathname: '', defaultView, regulationData, searchParams }),
        [defaultView, regulationData, searchParams]
    );

    // Old links name a place in the hash, or a place with the wrong view: rewrite them in place.
    useEffect(() => {
        const live = resolveConsultationUrlState({
            pathname: '',
            defaultView,
            regulationData,
            searchParams,
            liveSearch: window.location.search,
            liveHash: window.location.hash,
        });
        if (live.needsCanonicalUrl) navigateTo(live.canonicalUrl, { replace: true });
    }, [defaultView, regulationData, searchParams]);

    // The screen before this one, for back links that return where the reader came from.
    const [trail, setTrail] = useState<{ current: Place; previous: Place | null }>({
        current: { view: urlState.view, entityId: urlState.entityId },
        previous: null,
    });
    if (trail.current.view !== urlState.view || trail.current.entityId !== urlState.entityId) {
        setTrail({
            current: { view: urlState.view, entityId: urlState.entityId },
            previous: trail.current.view !== urlState.view ? trail.current : trail.previous,
        });
    }
    const previous = trail.previous;

    // The reader's address lives in this tab only: never in the URL, so analytics never see it.
    const addressKey = `oc:consultation:${consultationId}:address`;
    const [address, setAddress] = useState<Location | null>(null);
    const [addressLoaded, setAddressLoaded] = useState(false);
    useEffect(() => {
        try {
            const saved: unknown = JSON.parse(sessionStorage.getItem(addressKey) ?? 'null');
            if (isLocation(saved)) setAddress(saved);
        } catch {
            // Storage can be unavailable (private mode, blocked site data): the reader types it again.
        }
        setAddressLoaded(true);
    }, [addressKey]);

    const [cityData, setCityData] = useState<CityWithGeometry | null>(null);
    useEffect(() => {
        fetch(`/api/cities/${cityId}`)
            .then(response => response.ok ? response.json() : null)
            .then(data => setCityData(data))
            .catch(error => console.error('Error fetching city data:', error));
    }, [cityId]);

    const geoSets = useMemo(() => extractGeoSets(regulationData), [regulationData]);
    const lookupConfig = regulationData?.addressLookup;
    const lookup = useMemo(
        () => address && lookupConfig ? computeAddressLookup(address.coordinates, geoSets, lookupConfig) : null,
        [address, geoSets, lookupConfig]
    );
    const highlightIds = useMemo(() => new Set(lookup?.street.map(item => item.geometry.id) ?? []), [lookup]);

    // The server's comments, with the reader's agreements and deletions applied since they arrived.
    // A refresh (after a new comment) brings a new server copy, which replaces this one.
    const [serverComments, setServerComments] = useState(comments);
    const [liveComments, setLiveComments] = useState(comments);
    if (comments !== serverComments) {
        setServerComments(comments);
        setLiveComments(comments);
    }
    const onUpvoted = useCallback((commentId: string, change: { upvoteCount: number; hasUserUpvoted: boolean }) => {
        setLiveComments(list => list.map(comment => comment.id === commentId ? { ...comment, ...change } : comment));
    }, []);
    const onDeleted = useCallback((commentId: string) => {
        setLiveComments(list => list.filter(comment => comment.id !== commentId));
    }, []);

    const commentCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const comment of liveComments) counts.set(comment.entityId, (counts.get(comment.entityId) ?? 0) + 1);
        return counts;
    }, [liveComments]);

    // Where an opened place came from, for analytics; a map tap or a reference link says so first.
    const openSource = useRef<ConsultationEntityOpenSource | null>(null);

    const selectPlace = useCallback((id: string) => {
        openSource.current = 'map';
        navigateTo(href('map', id));
    }, []);

    const openReference = useCallback((id: string) => {
        const type = resolveConsultationEntityType(regulationData, id);
        if (!type) return;
        openSource.current = 'reference';
        navigateTo(href(getConsultationViewForEntityType(type), id));
    }, [regulationData]);

    const handleAddress = (location: Location) => {
        const next: Location = { text: location.text, coordinates: location.coordinates };
        setAddress(next);
        try {
            sessionStorage.setItem(addressKey, JSON.stringify(next));
        } catch {
            // As above: the address is simply not remembered.
        }
        if (lookupConfig) {
            const result = computeAddressLookup(next.coordinates, geoSets, lookupConfig);
            captureConsultationAddressSearched({
                consultation_id: consultationId,
                city_id: cityId,
                in_zone: !!result.zone,
                zone_id: result.zone?.geometry.id ?? null,
                street_count: result.street.length,
                nearby_count: result.nearby.length,
            });
        }
        navigateTo(href('street'));
    };

    // Resolve what each screen needs; a screen without its data falls back to the start.
    const hasOverview = !!regulationData?.overview?.length;
    const entityDisplay = describeEntity(regulationData, geoSets, urlState.entityId);
    let view = urlState.view;
    if (view === 'street' && addressLoaded && !lookup) view = 'home';
    if (view === 'plan' && !hasOverview) view = 'home';
    if (view === 'comment' && !entityDisplay) view = 'home';

    useEffect(() => {
        if (view !== 'map' || !entityDisplay) return;
        captureConsultationEntityOpened({
            consultation_id: consultationId,
            city_id: cityId,
            entity_type: entityDisplay.type,
            entity_id: entityDisplay.id,
            geoset_id: entityDisplay.geoSetId,
            source: openSource.current ?? (previous?.view === 'street' ? 'address_lookup' : previous ? 'list' : 'url'),
        });
        openSource.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one event per opened place
    }, [view, entityDisplay?.id]);

    // A new screen starts at its top, unless it scrolls to a card or a section of its own.
    const panelRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if ((view === 'plan' || view === 'document') && urlState.entityId) return;
        window.scrollTo(0, 0);
        panelRef.current?.scrollTo(0, 0);
    }, [view, urlState.entityId]);

    const [sheetRef, sheetHeight] = useElementHeight();

    if (!regulationData) {
        return (
            <div className="min-h-dvh bg-stone-100 text-stone-700">
                {header}
                <div className="mx-auto max-w-xl px-5 py-16">
                    <h1 className="mb-2 text-xl font-bold text-stone-900">Δεν ήταν δυνατή η φόρτωση της διαβούλευσης</h1>
                    <p>Δοκιμάστε ξανά σε λίγο.</p>
                </div>
            </div>
        );
    }

    const active = consultation.isActiveComputed;
    // The end date is stored as the city's wall time in the UTC fields, so read it back in UTC.
    const endsAt = new Date(consultation.endDate);
    const endDate = `${formatDate(endsAt, 'UTC')}, ${formatClockTime(endsAt, 'UTC')}`;
    const deadlineLabel = active ? `Σχόλια έως ${endDate}` : `Η διαβούλευση έληξε στις ${endDate}`;
    const title = regulationData.title || consultation.name;
    const cityHref = `/${cityId}`;
    const planHref = hasOverview ? href('plan') : undefined;
    const homeOrStreet = lookup ? href('street') : href('home');
    const selectedId = entityDisplay && (entityDisplay.type === 'geometry' || entityDisplay.type === 'geoset') && (view === 'map' || view === 'comment')
        ? entityDisplay.id
        : null;
    const placeBackHref = previous && ['home', 'street', 'plan', 'comments'].includes(previous.view)
        ? href(previous.view, previous.entityId)
        : homeOrStreet;

    const homeView = (
        <HomeView
            title={title}
            intro={regulationData.summary}
            regulationData={regulationData}
            onReferenceClick={openReference}
            municipalityName={municipalityName}
            cityLogoUrl={cityLogoUrl}
            cityHref={cityHref}
            deadline={{ active, label: deadlineLabel }}
            canLookUpAddress={!!lookupConfig}
            cityData={cityData}
            onAddress={handleAddress}
            planHref={planHref}
            mapHref={href('map')}
            commentsHref={href('comments')}
            commentCount={liveComments.length}
            studyHref={href('document')}
            savedAddress={lookup && address ? { text: address.text, href: href('street') } : undefined}
        />
    );

    const renderPanel = (panelView: ConsultationView): ReactNode => {
        switch (panelView) {
            case 'street':
                if (!lookup || !address) return null; // the saved address is still loading
                return (
                    <StreetView
                        address={address}
                        lookup={lookup}
                        overview={regulationData.overview}
                        href={href}
                        commentCounts={commentCounts}
                        miniMap={isDesktop === false ? <MiniMap address={address} items={lookup.street} zone={lookup.zone} /> : undefined}
                    />
                );
            case 'comment':
                if (!entityDisplay) return homeView;
                return (
                    <CommentView
                        display={entityDisplay}
                        backHref={previous && previous.view !== 'comment'
                            ? href(previous.view, previous.entityId)
                            : href(getConsultationViewForEntityType(entityDisplay.type), entityDisplay.id)}
                        consultationId={consultationId}
                        cityId={cityId}
                        active={active}
                        posted={searchParams.get('posted') === '1'}
                        comments={liveComments.filter(comment => comment.entityId === entityDisplay.id)}
                        currentUserId={currentUser?.id}
                        onUpvoted={onUpvoted}
                        onDeleted={onDeleted}
                    />
                );
            case 'plan':
                return (
                    <PlanView
                        overview={regulationData.overview ?? []}
                        regulationData={regulationData}
                        focusId={urlState.entityId}
                        href={href}
                        backHref={href('home')}
                        commentCounts={commentCounts}
                        active={active}
                        onReferenceClick={openReference}
                    />
                );
            case 'comments':
                return (
                    <CommentsView
                        comments={liveComments}
                        regulationData={regulationData}
                        geoSets={geoSets}
                        href={href}
                        backHref={href('home')}
                        printHref={`/${cityId}/consultation/${consultationId}/comments`}
                        currentUserId={currentUser?.id}
                        onUpvoted={onUpvoted}
                        onDeleted={onDeleted}
                    />
                );
            case 'map':
                // On a computer the map is beside the panel: the panel shows the open place, or the start.
                if (entityDisplay) {
                    return (
                        <PlaceView
                            display={entityDisplay}
                            commentCount={commentCounts.get(entityDisplay.id) ?? 0}
                            explainingCard={findExplainingCard(regulationData.overview, entityDisplay.geoSetId)}
                            href={href}
                            closeHref={placeBackHref}
                            active={active}
                            variant="panel"
                        />
                    );
                }
                return lookup ? renderPanel('street') : homeView;
            default:
                return homeView;
        }
    };

    const studyView = (
        <StudyView
            regulationData={regulationData}
            entityId={urlState.entityId}
            href={href}
            backHref={href('home')}
            commentCounts={commentCounts}
            active={active}
            onReferenceClick={openReference}
            consultationId={consultationId}
            cityId={cityId}
            realm={realm}
            municipalityName={municipalityName}
        />
    );

    const map = (props: { className: string; bottomInset?: number; leading?: ReactNode; children?: ReactNode }) => (
        <ConsultationMap
            regulationData={regulationData}
            geoSets={geoSets}
            selectedId={selectedId}
            onSelect={selectPlace}
            address={address}
            highlightIds={highlightIds}
            onAddressClick={lookup ? () => navigateTo(href('street')) : undefined}
            onAddress={lookupConfig ? handleAddress : undefined}
            currentUser={currentUser}
            cityData={cityData}
            {...props}
        />
    );

    // Until the screen size is known the map screen shows an empty ground, not the panel layout:
    // on a phone that would flash the start screen before the full-screen map replaces it.
    if (view === 'map' && isDesktop === null) {
        return <div className="h-dvh w-full bg-stone-200" />;
    }

    // The phone's map fills the screen; a tapped place opens as a card over it.
    if (view === 'map' && isDesktop === false) {
        return (
            <div className="relative h-dvh w-full overflow-hidden bg-stone-200">
                {map({
                    className: "absolute inset-0",
                    bottomInset: entityDisplay ? sheetHeight : 0,
                    leading: (
                        <ViewLink href={homeOrStreet} aria-label="Πίσω" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-stone-900 shadow-md">
                            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                        </ViewLink>
                    ),
                    children: entityDisplay ? (
                        <div ref={sheetRef} className="absolute inset-x-0 bottom-0 z-20">
                            <PlaceView
                                display={entityDisplay}
                                commentCount={commentCounts.get(entityDisplay.id) ?? 0}
                                explainingCard={findExplainingCard(regulationData.overview, entityDisplay.geoSetId)}
                                href={href}
                                closeHref={href('map')}
                                active={active}
                                variant="sheet"
                            />
                        </div>
                    ) : undefined,
                })}
            </div>
        );
    }

    const bar = (
        <ConsultationBar
            className="hidden lg:flex"
            title={title}
            municipalityName={municipalityName}
            deadlineLabel={deadlineLabel}
            homeHref={href('home')}
            planHref={planHref}
            commentsHref={href('comments')}
            commentCount={liveComments.length}
            studyHref={href('document')}
        />
    );

    if (view === 'document') {
        return (
            <div className="min-h-dvh bg-white">
                {header}
                {bar}
                {studyView}
            </div>
        );
    }

    // Every other screen: a page of its own on a phone; on a computer, a panel beside the map.
    // The layout comes from CSS so the server renders the panel; only the map waits for the screen size.
    return (
        <div className="min-h-dvh bg-stone-100 lg:flex lg:h-dvh lg:flex-col">
            {header}
            {bar}
            <div className="lg:flex lg:min-h-0 lg:flex-1">
                {isDesktop && map({ className: "min-w-0 flex-1" })}
                <div ref={panelRef} className="lg:ml-auto lg:w-[460px] lg:shrink-0 xl:w-[520px] lg:overflow-y-auto lg:border-l lg:border-stone-200">
                    {renderPanel(view)}
                </div>
            </div>
        </div>
    );
}

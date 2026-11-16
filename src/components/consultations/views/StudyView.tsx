"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Realm } from "@prisma/client";
import ConsultationDocument from "../ConsultationDocument";
import type { ConsultationView } from "../consultationUrl";
import type { RegulationData } from "../types";
import { navigateTo, pageClass, ViewHeader } from "./ui";

export interface StudyViewProps {
    regulationData: RegulationData;
    /** A chapter or article to open and scroll to. */
    entityId: string | null;
    /**
     * The text is a pane beside the consultation's panel (a computer, no map). It opens whole, it
     * marks `entityId`, and opening a section does not change the screen: the panel may hold a draft.
     */
    inPane?: boolean;
    /** Whether the text is on screen. A text that comes into view scrolls to `entityId`. */
    visible?: boolean;
    /** What the full text is called: "Ολόκληρη η μελέτη". */
    title: string;
    href: (view: ConsultationView, entityId?: string | null) => string;
    backHref: string;
    commentCounts: Map<string, number>;
    active: boolean;
    onReferenceClick: (entityId: string) => void;
    consultationId: string;
    cityId: string;
    realm: Realm;
}

function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
}

function without(set: Set<string>, ids: string[]): Set<string> {
    if (!ids.some(id => set.has(id))) return set;
    const next = new Set(set);
    for (const id of ids) next.delete(id);
    return next;
}

/** The full study, chapter by chapter, for the reader who wants every detail. */
export default function StudyView({
    regulationData,
    entityId,
    inPane = false,
    visible = true,
    title,
    href,
    backHref,
    commentCounts,
    active,
    onReferenceClick,
    consultationId,
    cityId,
    realm,
}: StudyViewProps) {
    // A page starts closed, and remembers what the reader opened. A pane starts open, and remembers
    // what the reader closed: the open sections then come from the regulation in the same render,
    // so a scroll to one of them measures the text at its full height.
    const [opened, setOpened] = useState<Set<string>>(new Set());
    const [closed, setClosed] = useState<Set<string>>(new Set());
    const sectionIds = useMemo(() => {
        const chapters = regulationData.regulation.filter(item => item.type === 'chapter');
        return {
            chapters: chapters.map(chapter => chapter.id),
            articles: chapters.flatMap(chapter => chapter.articles?.map(article => article.id) ?? []),
        };
    }, [regulationData]);
    const expanded = useCallback(
        (ids: string[]) => new Set(ids.filter(id => inPane ? !closed.has(id) : opened.has(id))),
        [inPane, opened, closed]
    );
    const expandedChapters = useMemo(() => expanded(sectionIds.chapters), [expanded, sectionIds]);
    const expandedArticles = useMemo(() => expanded(sectionIds.articles), [expanded, sectionIds]);

    // On a page, opening a section names it in the URL, so the address bar is the link to it.
    const toggleSection = (id: string, isExpanded: boolean) => {
        if (inPane) {
            setClosed(prev => toggle(prev, id));
            return;
        }
        setOpened(prev => toggle(prev, id));
        if (!isExpanded) navigateTo(href('document', id), { replace: true });
    };
    const toggleChapter = (id: string) => toggleSection(id, expandedChapters.has(id));
    const toggleArticle = (id: string) => toggleSection(id, expandedArticles.has(id));

    // Open the linked chapter or article (and its chapter), then scroll to it once it has rendered.
    useEffect(() => {
        if (!entityId || !visible) return;
        const chapter = regulationData.regulation.find(item =>
            item.type === 'chapter' && (item.id === entityId || item.articles?.some(article => article.id === entityId))
        );
        if (!chapter) return;
        setOpened(prev => prev.has(chapter.id) && prev.has(entityId) ? prev : new Set(prev).add(chapter.id).add(entityId));
        setClosed(prev => without(prev, [chapter.id, entityId]));

        let attempts = 0;
        let frame = 0;
        const tryScroll = () => {
            const element = document.getElementById(entityId);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else if (attempts++ < 60) {
                frame = window.requestAnimationFrame(tryScroll);
            }
        };
        frame = window.requestAnimationFrame(tryScroll);
        return () => window.cancelAnimationFrame(frame);
        // `inPane`: the text that becomes a pane opens whole, so the section has moved.
    }, [entityId, regulationData, visible, inPane]);

    const commentCount = useCallback(
        (ids: string[]) => ids.reduce((sum, id) => sum + (commentCounts.get(id) ?? 0), 0),
        [commentCounts]
    );
    const commentHref = useCallback((id: string) => href('comment', id), [href]);
    const chapterHref = useCallback((id: string) => href('document', id), [href]);

    return (
        <div className={pageClass}>
            <div className="lg:hidden">
                <ViewHeader backHref={backHref} title={title} />
            </div>
            <ConsultationDocument
                realm={realm}
                regulationData={regulationData}
                expandedChapters={expandedChapters}
                expandedArticles={expandedArticles}
                onToggleChapter={toggleChapter}
                onToggleArticle={toggleArticle}
                onReferenceClick={onReferenceClick}
                commentCount={commentCount}
                commentHref={commentHref}
                chapterHref={chapterHref}
                currentEntityId={entityId}
                inPane={inPane}
                consultationId={consultationId}
                cityId={cityId}
                consultationIsActive={active}
            />
        </div>
    );
}

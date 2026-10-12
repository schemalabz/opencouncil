"use client";

import { useCallback, useEffect, useState } from "react";
import type { Realm } from "@prisma/client";
import ConsultationDocument from "../ConsultationDocument";
import type { ConsultationView } from "../consultationUrl";
import type { RegulationData } from "../types";
import { navigateTo, pageClass, ViewHeader } from "./ui";

export interface StudyViewProps {
    regulationData: RegulationData;
    /** A chapter or article to open and scroll to. */
    entityId: string | null;
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

/** The full study, chapter by chapter, for the reader who wants every detail. */
export default function StudyView({
    regulationData,
    entityId,
    href,
    backHref,
    commentCounts,
    active,
    onReferenceClick,
    consultationId,
    cityId,
    realm,
}: StudyViewProps) {
    const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
    const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set());

    // Opening a section names it in the URL, so the address bar is the link to it.
    const toggleChapter = (id: string) => {
        setExpandedChapters(prev => toggle(prev, id));
        if (!expandedChapters.has(id)) navigateTo(href('document', id), { replace: true });
    };
    const toggleArticle = (id: string) => {
        setExpandedArticles(prev => toggle(prev, id));
        if (!expandedArticles.has(id)) navigateTo(href('document', id), { replace: true });
    };

    // Open the linked chapter or article (and its chapter), then scroll to it once it has rendered.
    useEffect(() => {
        if (!entityId) return;
        const chapter = regulationData.regulation.find(item =>
            item.type === 'chapter' && (item.id === entityId || item.articles?.some(article => article.id === entityId))
        );
        if (!chapter) return;
        setExpandedChapters(prev => new Set(prev).add(chapter.id));
        if (chapter.id !== entityId) setExpandedArticles(prev => new Set(prev).add(entityId));

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
    }, [entityId, regulationData]);

    const commentCount = useCallback(
        (ids: string[]) => ids.reduce((sum, id) => sum + (commentCounts.get(id) ?? 0), 0),
        [commentCounts]
    );
    const commentHref = useCallback((id: string) => href('comment', id), [href]);
    const chapterHref = useCallback((id: string) => href('document', id), [href]);

    return (
        <div className={pageClass}>
            <div className="lg:hidden">
                <ViewHeader backHref={backHref} title="Ολόκληρη η μελέτη" />
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
                consultationId={consultationId}
                cityId={cityId}
                consultationIsActive={active}
            />
        </div>
    );
}

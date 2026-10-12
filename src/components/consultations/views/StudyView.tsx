"use client";

import { useCallback, useEffect, useState } from "react";
import type { Realm } from "@prisma/client";
import ConsultationDocument from "../ConsultationDocument";
import type { ConsultationView } from "../consultationUrl";
import type { RegulationData } from "../types";
import { ViewHeader } from "./ui";

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
    municipalityName?: string;
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
    municipalityName,
}: StudyViewProps) {
    const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
    const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set());

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

    return (
        <div className="min-h-full bg-white">
            <div className="lg:hidden">
                <ViewHeader backHref={backHref} title="Ολόκληρη η μελέτη" />
            </div>
            <ConsultationDocument
                realm={realm}
                regulationData={regulationData}
                expandedChapters={expandedChapters}
                expandedArticles={expandedArticles}
                onToggleChapter={id => setExpandedChapters(prev => toggle(prev, id))}
                onToggleArticle={id => setExpandedArticles(prev => toggle(prev, id))}
                onReferenceClick={onReferenceClick}
                commentCount={commentCount}
                commentHref={commentHref}
                consultationId={consultationId}
                cityId={cityId}
                municipalityName={municipalityName}
                consultationIsActive={active}
            />
        </div>
    );
}

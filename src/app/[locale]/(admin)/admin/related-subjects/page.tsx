import { Metadata } from 'next';
import prisma from '@/lib/db/prisma';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { findRelatedSubjects } from '@/lib/search/related';
import { searchSubjectsByName, SubjectSearchHit } from '@/lib/db/subject';
import { RelatedSubjectResult } from '@/lib/search/types';
import { RelatedSubjectsDebug } from './related-subjects-debug';

export const metadata: Metadata = {
    title: 'Related Subjects Debug - OpenCouncil Admin',
    description: 'Inspect related-subjects hybrid search output for any subject',
};

type SourceSubject = {
    id: string;
    name: string;
    description: string | null;
    cityId: string;
    topicId: string | null;
    councilMeeting: { administrativeBodyId: string | null } | null;
};

async function loadSource(subjectId: string): Promise<SourceSubject | null> {
    return prisma.subject.findUnique({
        where: { id: subjectId },
        select: {
            id: true,
            name: true,
            description: true,
            cityId: true,
            topicId: true,
            councilMeeting: { select: { administrativeBodyId: true } },
        },
    });
}

function group(source: SourceSubject, results: RelatedSubjectResult[]) {
    const sourceAdminBodyId = source.councilMeeting?.administrativeBodyId ?? null;
    const sameBody: RelatedSubjectResult[] = [];
    const elsewhere: RelatedSubjectResult[] = [];
    for (const r of results) {
        if (
            r.cityId === source.cityId &&
            sourceAdminBodyId !== null &&
            r.adminBodyId === sourceAdminBodyId
        ) {
            sameBody.push(r);
        } else {
            elsewhere.push(r);
        }
    }
    sameBody.sort((a, b) => {
        if (!a.meetingDate && !b.meetingDate) return 0;
        if (!a.meetingDate) return 1;
        if (!b.meetingDate) return -1;
        return new Date(b.meetingDate).getTime() - new Date(a.meetingDate).getTime();
    });
    return { sameBody, elsewhere };
}

export default async function RelatedSubjectsAdminPage({
    searchParams,
}: {
    searchParams: Promise<{ subjectId?: string; name?: string }>;
}) {
    await withUserAuthorizedToEdit({});

    const { subjectId, name } = await searchParams;

    let source: SourceSubject | null = null;
    let sameBody: RelatedSubjectResult[] = [];
    let elsewhere: RelatedSubjectResult[] = [];
    let nameMatches: SubjectSearchHit[] = [];
    let esError: string | null = null;

    if (subjectId) {
        source = await loadSource(subjectId);
        if (source) {
            try {
                const results = await findRelatedSubjects({
                    subjectId: source.id,
                    subjectName: source.name,
                    subjectDescription: source.description,
                    topicId: source.topicId,
                });
                const grouped = group(source, results);
                sameBody = grouped.sameBody;
                elsewhere = grouped.elsewhere;
            } catch (e) {
                esError = e instanceof Error ? e.message : String(e);
            }
        }
    } else if (name) {
        nameMatches = await searchSubjectsByName(name, 50);
    }

    return (
        <div className="container mx-auto py-6">
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Related Subjects Debug</h1>
                    <p className="text-muted-foreground">
                        Inspect the hybrid (BM25 + semantic, RRF-fused) search output for any subject.
                    </p>
                </div>

                <RelatedSubjectsDebug
                    subjectId={subjectId ?? ''}
                    nameQuery={name ?? ''}
                    source={source}
                    sameBody={sameBody}
                    elsewhere={elsewhere}
                    nameMatches={nameMatches}
                    notFound={Boolean(subjectId) && !source}
                    esError={esError}
                />
            </div>
        </div>
    );
}

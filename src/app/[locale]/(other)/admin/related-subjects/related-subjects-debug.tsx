'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RelatedSubjectResult } from '@/lib/search/types';
import { SubjectSearchHit } from '@/lib/db/subject';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type SourceSubject = {
    id: string;
    name: string;
    description: string | null;
    cityId: string;
    topicId: string | null;
    councilMeeting: { administrativeBodyId: string | null } | null;
};

interface Props {
    subjectId: string;
    nameQuery: string;
    source: SourceSubject | null;
    sameBody: RelatedSubjectResult[];
    elsewhere: RelatedSubjectResult[];
    nameMatches: SubjectSearchHit[];
    notFound: boolean;
    esError: string | null;
}

export function RelatedSubjectsDebug({
    subjectId,
    nameQuery,
    source,
    sameBody,
    elsewhere,
    nameMatches,
    notFound,
    esError,
}: Props) {
    const router = useRouter();
    const [idInput, setIdInput] = useState(subjectId);
    const [nameInput, setNameInput] = useState(nameQuery);

    const submitById = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = idInput.trim();
        if (!trimmed) return;
        router.push(`/admin/related-subjects?subjectId=${encodeURIComponent(trimmed)}`);
    };

    const submitByName = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = nameInput.trim();
        if (!trimmed) return;
        router.push(`/admin/related-subjects?name=${encodeURIComponent(trimmed)}`);
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Lookup by subject ID</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={submitById} className="flex gap-2">
                            <Input
                                value={idInput}
                                onChange={e => setIdInput(e.target.value)}
                                placeholder="cuid…"
                            />
                            <Button type="submit">Evaluate</Button>
                        </form>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Search by name</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={submitByName} className="flex gap-2">
                            <Input
                                value={nameInput}
                                onChange={e => setNameInput(e.target.value)}
                                placeholder="partial name (case-insensitive)"
                            />
                            <Button type="submit" variant="secondary">Search</Button>
                        </form>
                    </CardContent>
                </Card>
            </div>

            {notFound && (
                <div className="text-sm text-destructive">No subject with id {subjectId}.</div>
            )}

            {nameMatches.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Matches for &ldquo;{nameQuery}&rdquo; ({nameMatches.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-1 text-sm">
                            {nameMatches.map(h => (
                                <li key={h.id} className="flex gap-3 items-center">
                                    <Link
                                        href={`/admin/related-subjects?subjectId=${encodeURIComponent(h.id)}`}
                                        className="text-primary underline-offset-2 hover:underline"
                                    >
                                        {h.name}
                                    </Link>
                                    <code className="text-xs text-muted-foreground">{h.id}</code>
                                    <span className="text-xs text-muted-foreground">city={h.cityId}</span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}

            {source && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Source subject</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div><span className="font-medium">name:</span> {source.name}</div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>id: <code>{source.id}</code></span>
                            <span>city: <code>{source.cityId}</code></span>
                            <span>topic: <code>{source.topicId ?? '—'}</code></span>
                            <span>adminBody: <code>{source.councilMeeting?.administrativeBodyId ?? '—'}</code></span>
                        </div>
                        {source.description && (
                            <div className="text-muted-foreground italic">{source.description}</div>
                        )}
                    </CardContent>
                </Card>
            )}

            {esError && (
                <div className="text-sm text-destructive">Elasticsearch error: {esError}</div>
            )}

            {source && !esError && (
                <>
                    <ResultsTable
                        title={`sameBody (${sameBody.length}) — same city + admin body, by date DESC`}
                        rows={sameBody}
                    />
                    <ResultsTable
                        title={`elsewhere (${elsewhere.length}) — by RRF score DESC`}
                        rows={elsewhere}
                    />
                </>
            )}
        </div>
    );
}

function ResultsTable({ title, rows }: { title: string; rows: RelatedSubjectResult[] }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                {rows.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No results.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-xs uppercase text-muted-foreground border-b">
                                <tr>
                                    <th className="text-left py-2 pr-3">#</th>
                                    <th className="text-right py-2 pr-3">score</th>
                                    <th className="text-left py-2 pr-3">date</th>
                                    <th className="text-left py-2 pr-3">topic</th>
                                    <th className="text-left py-2 pr-3">city</th>
                                    <th className="text-left py-2 pr-3">body</th>
                                    <th className="text-left py-2 pr-3">name</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r, i) => (
                                    <tr key={r.id} className="border-b last:border-0 align-top">
                                        <td className="py-2 pr-3 text-muted-foreground">{i + 1}</td>
                                        <td className="py-2 pr-3 text-right font-mono">{r.score.toFixed(4)}</td>
                                        <td className="py-2 pr-3 whitespace-nowrap">{r.meetingDate?.slice(0, 10) ?? '—'}</td>
                                        <td className="py-2 pr-3">
                                            {r.topicName ? (
                                                <Badge
                                                    variant="outline"
                                                    style={r.topicColor ? { borderColor: r.topicColor, color: r.topicColor } : {}}
                                                >
                                                    {r.topicName}
                                                </Badge>
                                            ) : (
                                                <span className="text-muted-foreground">—</span>
                                            )}
                                        </td>
                                        <td className="py-2 pr-3">{r.cityName ?? r.cityId}</td>
                                        <td className="py-2 pr-3">{r.adminBodyName ?? '—'}</td>
                                        <td className="py-2 pr-3">
                                            {r.meetingId ? (
                                                <Link
                                                    href={`/${r.cityId}/meetings/${r.meetingId}/subjects/${r.id}`}
                                                    target="_blank"
                                                    className="text-primary underline-offset-2 hover:underline"
                                                >
                                                    {r.name}
                                                </Link>
                                            ) : (
                                                r.name
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

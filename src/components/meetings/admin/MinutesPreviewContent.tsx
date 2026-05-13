"use client";

import { formatTimestamp } from '@/lib/utils';
import { formatGapDuration } from '@/lib/formatters/time';
import { getAbsentLabel, extractFirstName } from '@/lib/formatters/name';
import { el } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';
import {
    MinutesData,
    MinutesSubject,
    MinutesMember,
    MinutesCouncilComposition,
    MinutesTranscriptEntry,
    MinutesAttendanceChange,
} from '@/lib/minutes/types';
import { interleaveSubstitutes } from '@/lib/minutes/builders';
import { getWithdrawnLabel } from '@/lib/utils/subjects';

interface MinutesPreviewContentProps {
    data: MinutesData;
}

export function MinutesPreviewContent({ data }: MinutesPreviewContentProps) {
    const meetingDate = new Date(data.meeting.dateTime);

    const agendaSubjects = data.subjects
        .filter(s => s.nonAgendaReason !== 'outOfAgenda')
        .sort((a, b) => (a.agendaItemIndex ?? 0) - (b.agendaItemIndex ?? 0));
    const outOfAgendaSubjects = data.subjects.filter(s => s.nonAgendaReason === 'outOfAgenda');

    return (
        <div className="bg-white text-black font-serif max-w-[210mm] mx-auto px-12 py-8 text-sm leading-relaxed">
            {/* Title Page */}
            <div className="text-center mb-12 pt-16">
                <p className="text-base mb-2">{data.city.name_municipality}</p>
                {data.administrativeBody && (
                    <p className="text-base mb-2">{data.administrativeBody.name}</p>
                )}
                <h1 className="text-xl font-bold mt-6 mb-3">ΠΡΑΚΤΙΚΑ ΣΥΝΕΔΡΙΑΣΗΣ</h1>
                <p className="text-base font-bold mb-3">{data.meeting.name}</p>
                <p className="text-sm mb-8">
                    {formatInTimeZone(meetingDate, data.city.timezone, 'EEEE, d MMMM yyyy, HH:mm', { locale: el })}
                </p>
                <p className="text-sm font-bold text-orange-600 mt-8">
                    Προσοχή: Ανεπίσημο έγγραφο
                </p>
                <p className="text-xs text-gray-500 mt-3">
                    Παράγεται αυτόματα από το OpenCouncil
                </p>
            </div>

            <hr className="my-8 border-gray-300" />

            {/* Council Composition + Absent Members */}
            {data.councilComposition && (
                <CouncilCompositionSection composition={data.councilComposition} absentMembers={data.absentMembers} adminBody={data.administrativeBody} />
            )}

            {/* Arrivals/departures */}
            {data.attendanceChanges.length > 0 && (
                <AttendanceChangesSection changes={data.attendanceChanges} />
            )}

            {/* Table of Contents */}
            {data.subjects.length > 0 && (
                <TOCSections
                    agenda={agendaSubjects}
                    outOfAgenda={outOfAgendaSubjects}
                />
            )}

            {/* Preamble: orphaned utterances before the first subject */}
            {data.preambleEntries.length > 0 && (
                <TranscriptSection entries={data.preambleEntries} />
            )}

            {/* All subjects in discussion order (skip withdrawn — they appear in TOC only) */}
            {data.subjects.filter(s => !s.withdrawn).map((subject) => (
                <SubjectSection key={subject.subjectId} subject={subject} />
            ))}

            {/* Epilogue: orphaned utterances after the last subject */}
            {data.epilogueEntries.length > 0 && (
                <TranscriptSection entries={data.epilogueEntries} />
            )}
        </div>
    );
}

function CouncilCompositionSection({ composition, absentMembers, adminBody }: {
    composition: MinutesCouncilComposition;
    absentMembers: MinutesMember[] | null;
    adminBody: { name: string; type: string } | null;
}) {
    const absentPersonIds = new Set(absentMembers?.map(m => m.personId) ?? []);
    const isCommittee = adminBody?.type === 'committee';

    return (
        <div className="mb-8">
            {!isCommittee && composition.mayor && (
                <p className="text-sm mb-1">
                    <span className="font-bold">ΔΗΜΑΡΧΟΣ: </span>
                    {composition.mayor.name}
                    {absentPersonIds.has(composition.mayor.personId) && (
                        <span className="text-gray-500"> ({getAbsentLabel(extractFirstName(composition.mayor.name, 'surnameFirst'))})</span>
                    )}
                </p>
            )}

            {composition.president && (
                <p className="text-sm mb-4">
                    <span className="font-bold">ΠΡΟΕΔΡΟΣ: </span>
                    {composition.president.name}
                    {isCommittee && ' (ΔΗΜΑΡΧΟΣ)'}
                    {absentPersonIds.has(composition.president.personId) && (
                        <span className="text-gray-500"> ({getAbsentLabel(extractFirstName(composition.president.name, 'surnameFirst'))})</span>
                    )}
                </p>
            )}

            {!isCommittee && (
                <h2 className="text-base font-bold mb-3">
                    ΣΥΝΘΕΣΗ ΔΗΜΟΤΙΚΟΥ ΣΥΜΒΟΥΛΙΟΥ ({composition.members.length})
                </h2>
            )}

            {isCommittee ? (
                <CommitteeAttendanceSection composition={composition} absentMembers={absentMembers} />
            ) : (
                <>
                    <ul className="list-disc pl-6 space-y-1">
                        {composition.members.map((member) => (
                            <li key={member.personId}>
                                <span>{member.name}</span>
                                {member.party && (
                                    <span className="text-gray-500"> ({member.party}{member.isPartyHead ? ', Επικεφαλής' : ''})</span>
                                )}
                            </li>
                        ))}
                    </ul>

                    {absentMembers && absentMembers.length > 0 && (() => {
                        const absentListMembers = absentMembers.filter(m =>
                            (!composition.mayor || m.personId !== composition.mayor.personId) &&
                            (!composition.president || m.personId !== composition.president.personId)
                        );
                        return absentListMembers.length > 0 ? (
                            <p className="text-sm mt-4">
                                Κατά την έναρξη της συνεδρίασης απουσίαζαν οι {absentListMembers.map(m => m.name).join(', ')}
                                <span className="text-gray-500"> ({absentListMembers.length})</span>
                            </p>
                        ) : null;
                    })()}
                </>
            )}

            <hr className="my-8 border-gray-300" />
        </div>
    );
}

function AttendanceChangesSection({ changes }: { changes: MinutesAttendanceChange[] }) {
    const arrivals = changes.filter(c => c.type === 'arrival');
    const departures = changes.filter(c => c.type === 'departure');

    return (
        <div className="mt-4 space-y-2">
            {arrivals.length > 0 && (
                <div>
                    <p className="font-bold text-sm">ΑΦΙΞΕΙΣ</p>
                    <ul className="list-disc pl-5 text-sm">
                        {arrivals.map((change, i) => (
                            <li key={i}>
                                {change.name}
                                <span className="text-muted-foreground">
                                    {' — παρών/παρούσα από το '}
                                    {change.atSubject.agendaItemIndex
                                        ? `${change.atSubject.agendaItemIndex}ο θέμα`
                                        : change.atSubject.name}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {departures.length > 0 && (
                <div>
                    <p className="font-bold text-sm">ΑΝΑΧΩΡΗΣΕΙΣ</p>
                    <ul className="list-disc pl-5 text-sm">
                        {departures.map((change, i) => (
                            <li key={i}>
                                {change.name}
                                <span className="text-muted-foreground">
                                    {' — απουσίαζε από το '}
                                    {change.atSubject.agendaItemIndex
                                        ? `${change.atSubject.agendaItemIndex}ο θέμα`
                                        : change.atSubject.name}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

/** Strip Greek diacritics — uppercase Greek convention omits accents (τόνοι). */
function stripDiacritics(text: string): string {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Committee-specific attendance: ΠΑΡΟΝΤΑ ΜΕΛΗ and ΑΠΟΝΤΑ ΜΕΛΗ as bullet lists,
 * with (αναπλ. μέλος) notation for substitute members.
 */
function CommitteeAttendanceSection({ composition, absentMembers }: {
    composition: MinutesCouncilComposition;
    absentMembers: MinutesMember[] | null;
}) {
    const substituteIds = new Set(composition.substituteMembers.map(m => m.personId));
    const absentPersonIds = new Set(absentMembers?.map(m => m.personId) ?? []);

    const allMembers = interleaveSubstitutes(composition.members, composition.substituteMembers);
    const presentMembers = allMembers.filter(m => !absentPersonIds.has(m.personId));
    const absentMembersList = allMembers.filter(m => absentPersonIds.has(m.personId));

    const renderMember = (m: MinutesMember) => {
        const labels: string[] = [];
        if (substituteIds.has(m.personId)) labels.push('αναπλ. μέλος');
        if (m.party) labels.push(m.isPartyHead ? `${m.party}, Επικεφαλής` : m.party);
        return (
            <li key={m.personId}>
                <span>{m.name}</span>
                {labels.length > 0 && (
                    <span className="text-gray-500"> ({labels.join(', ')})</span>
                )}
            </li>
        );
    };

    return (
        <>
            {presentMembers.length > 0 && (
                <>
                    <p className="text-sm font-bold mt-2 mb-1">ΠΑΡΟΝΤΑ ΜΕΛΗ ({presentMembers.length})</p>
                    <ul className="list-disc pl-6 space-y-1">
                        {presentMembers.map(renderMember)}
                    </ul>
                </>
            )}

            {absentMembersList.length > 0 && (
                <>
                    <p className="text-sm font-bold mt-4 mb-1">ΑΠΟΝΤΑ ΜΕΛΗ ({absentMembersList.length})</p>
                    <ul className="list-disc pl-6 space-y-1">
                        {absentMembersList.map(renderMember)}
                    </ul>
                </>
            )}
        </>
    );
}

function TOCSections({ agenda, outOfAgenda }: { agenda: MinutesSubject[]; outOfAgenda: MinutesSubject[] }) {
    return (
        <div className="mb-8">
            {agenda.length > 0 && (
                <>
                    <h2 className="text-base font-bold mb-3">
                        ΘΕΜΑΤΑ ΗΜΕΡΗΣΙΑΣ ΔΙΑΤΑΞΗΣ
                    </h2>
                    <TOCTable subjects={agenda} useSequentialNumbers={false} />
                </>
            )}

            {outOfAgenda.length > 0 && (
                <>
                    <h2 className={`text-base font-bold mb-3 ${agenda.length > 0 ? 'mt-6' : ''}`}>
                        ΕΚΤΟΣ ΗΜΕΡΗΣΙΑΣ ΔΙΑΤΑΞΗΣ ΘΕΜΑΤΑ
                    </h2>
                    <TOCTable subjects={outOfAgenda} useSequentialNumbers />
                </>
            )}

            <hr className="my-8 border-gray-300" />
        </div>
    );
}

function TOCTable({ subjects, useSequentialNumbers }: { subjects: MinutesSubject[]; useSequentialNumbers: boolean }) {
    return (
        <table className="w-full text-xs border-collapse">
            <thead>
                <tr className="border-b border-gray-300">
                    <th className="text-left py-1 pr-2 w-12">Α/Α</th>
                    <th className="text-left py-1 pr-2">Θέμα</th>
                    <th className="text-left py-1 pr-2 w-32">Αρ. Απόφασης</th>
                </tr>
            </thead>
            <tbody>
                {subjects.map((subject, index) => (
                    <tr key={subject.subjectId} className={`border-b border-gray-200 ${subject.withdrawn ? 'text-gray-400 italic' : ''}`}>
                        <td className="py-1 pr-2 align-top">
                            {useSequentialNumbers ? index + 1 : subject.agendaItemIndex ?? ''}
                        </td>
                        <td className="py-1 pr-2">
                            {subject.withdrawn ? (
                                <span>{subject.name}</span>
                            ) : (
                                <a href={`#subject-${subject.subjectId}`} className="hover:underline text-blue-800">
                                    {subject.name}
                                </a>
                            )}
                        </td>
                        <td className="py-1 pr-2 text-gray-500">
                            {subject.withdrawn
                                ? getWithdrawnLabel(subject)
                                : (subject.decision?.protocolNumber ?? '')}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function SubjectSection({ subject }: { subject: MinutesSubject }) {
    const headingPrefix = subject.nonAgendaReason === 'outOfAgenda'
        ? null
        : subject.agendaItemIndex !== null
            ? `ΘΕΜΑ ${subject.agendaItemIndex}`
            : 'ΘΕΜΑ';

    const headingText = headingPrefix ? `${headingPrefix}: ${subject.name}` : subject.name;

    return (
        <div className="mb-10">
            {/* Orphaned utterances between previous subject and this one */}
            {subject.preDiscussionEntries.length > 0 && (
                <TranscriptSection entries={subject.preDiscussionEntries} />
            )}

            <h3 id={`subject-${subject.subjectId}`} className="text-base font-bold mt-8 mb-3">{headingText}</h3>

            {subject.discussedWith && (
                <p className="text-sm italic text-gray-500 mb-3">
                    Συζητήθηκε μαζί με{' '}
                    {subject.discussedWith.agendaItemIndex != null
                        ? `ΘΕΜΑ ${subject.discussedWith.agendaItemIndex}: ` : ''}
                    <a href={`#subject-${subject.discussedWith.id}`}
                       className="hover:underline text-blue-600">
                        {subject.discussedWith.name}
                    </a>
                </p>
            )}

            {/* Transcript (no heading) */}
            {subject.transcriptEntries.length > 0 && (
                <TranscriptSection entries={subject.transcriptEntries} />
            )}

            {/* Decision excerpt (no heading, extra spacing from transcript) */}
            {subject.decision?.excerpt && (
                <div className="mt-8">
                    <MarkdownContent text={subject.decision.excerpt} />
                </div>
            )}

            {/* Footer: attendance, dissenting votes, decision number */}
            <SubjectFooter subject={subject} />
        </div>
    );
}

function formatMemberList(members: MinutesMember[]) {
    return members.map(m => m.name).join(', ');
}

function SubjectFooter({ subject }: { subject: MinutesSubject }) {
    const hasFooter = subject.voteResult || subject.decision?.protocolNumber;
    if (!hasFooter) return null;

    return (
        <div className="mt-4 text-xs">
            {/* Full vote breakdown */}
            {subject.voteResult && (
                <>
                    {subject.voteResult.forMembers.length > 0 && (
                        <p className="my-0.5">
                            <span className="font-bold">ΥΠΕΡ ({subject.voteResult.forMembers.length}): </span>
                            {formatMemberList(subject.voteResult.forMembers)}
                        </p>
                    )}
                    {subject.voteResult.againstMembers.length > 0 && (
                        <p className="my-0.5">
                            <span className="font-bold">ΚΑΤΑ ({subject.voteResult.againstMembers.length}): </span>
                            {formatMemberList(subject.voteResult.againstMembers)}
                        </p>
                    )}
                    {subject.voteResult.abstainMembers.length > 0 && (
                        <p className="my-0.5">
                            <span className="font-bold">ΛΕΥΚΑ ({subject.voteResult.abstainMembers.length}): </span>
                            {formatMemberList(subject.voteResult.abstainMembers)}
                        </p>
                    )}
                    {subject.voteResult.presentMembers.length > 0 && (
                        <p className="my-0.5">
                            <span className="font-bold">ΠΑΡΟΝΤΕΣ ({subject.voteResult.presentMembers.length}): </span>
                            {formatMemberList(subject.voteResult.presentMembers)}
                        </p>
                    )}
                    {subject.voteResult.didNotVoteMembers.length > 0 && (
                        <p className="my-0.5">
                            <span className="font-bold">ΑΠΟΧΗ ({subject.voteResult.didNotVoteMembers.length}): </span>
                            {formatMemberList(subject.voteResult.didNotVoteMembers)}
                        </p>
                    )}
                    {subject.voteResult.absentMembers.length > 0 && (
                        <p className="my-0.5">
                            <span className="font-bold">ΑΠΟΝΤΕΣ ({subject.voteResult.absentMembers.length}): </span>
                            {formatMemberList(subject.voteResult.absentMembers)}
                        </p>
                    )}
                </>
            )}

            {/* Decision number (right-aligned) */}
            {subject.decision?.protocolNumber && (
                <p className="text-right font-bold mt-2">
                    Αρ. Απόφασης: {subject.decision.protocolNumber}
                </p>
            )}
        </div>
    );
}

function TranscriptSection({ entries }: { entries: MinutesTranscriptEntry[] }) {
    return (
        <div className="mt-2">
            <div className="space-y-3">
                {entries.map((entry, i) => (
                    entry.type === 'gap' ? (
                        <div key={i} className="text-center text-sm text-gray-400 italic my-4 py-2 border-y border-dashed border-gray-200">
                            [Άλλη συζήτηση {formatGapDuration(entry.durationSeconds)}
                            {entry.subjects.length > 0 && (
                                <> — {entry.subjects.map((s, j) => (
                                    <span key={s.id}>
                                        {j > 0 && ', '}
                                        «<a href={`#subject-${s.id}`} className="hover:underline text-blue-400">
                                            {s.name}
                                        </a>»
                                    </span>
                                ))}</>
                            )}]
                        </div>
                    ) : (
                        <div key={i}>
                            <span className="font-bold">
                                {entry.speakerName} {entry.party ? `(${entry.party}${entry.isPartyHead ? ', Επικεφαλής' : ''})` : ''}
                            </span>
                            {entry.role && (
                                <span className="text-xs text-gray-500"> {entry.role}</span>
                            )}
                            <span className="text-xs text-gray-500 ml-1">
                                {formatTimestamp(entry.timestamp)}
                            </span>
                            <p className="mt-1">{entry.text}</p>
                        </div>
                    )
                ))}
            </div>
        </div>
    );
}

/** Renders simple markdown (paragraphs, bold, bullet lists, numbered lists) as HTML */
function MarkdownContent({ text }: { text: string }) {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed === '') {
            i++;
            continue;
        }

        // Table: sequence of lines starting with |
        if (trimmed.startsWith('|')) {
            const tableLines: string[] = [];
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                tableLines.push(lines[i].trim());
                i++;
            }
            elements.push(<MarkdownTable key={elements.length} lines={tableLines} />);
            continue;
        }

        // Bullet list
        const bulletMatch = trimmed.match(/^[-*•]\s+(.*)/);
        if (bulletMatch) {
            const items: string[] = [];
            while (i < lines.length) {
                const bm = lines[i].trim().match(/^[-*•]\s+(.*)/);
                if (!bm) break;
                items.push(bm[1]);
                i++;
            }
            elements.push(
                <ul key={elements.length} className="list-disc pl-6 my-1 space-y-0.5">
                    {items.map((item, j) => (
                        <li key={j}><BoldText text={item} /></li>
                    ))}
                </ul>
            );
            continue;
        }

        // Numbered list — render with original numbers from the source rather than
        // relying on <ol> auto-numbering, which restarts at 1 for each fragment.
        const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numberedMatch) {
            const items: Array<{ number: string; text: string }> = [];
            while (i < lines.length) {
                const nm = lines[i].trim().match(/^(\d+)\.\s+(.*)/);
                if (!nm) break;
                items.push({ number: nm[1], text: nm[2] });
                i++;
            }
            elements.push(
                <div key={elements.length} className="pl-6 my-1 space-y-0.5">
                    {items.map((item, j) => (
                        <p key={j}>{item.number}. <BoldText text={item.text} /></p>
                    ))}
                </div>
            );
            continue;
        }

        // Regular paragraph — center "decides" lines (various municipality styles)
        // Note: Greek case-insensitive matching doesn't handle tonos (ί vs ι), so match both
        const isCentered = /αποφασ[ιί]ζει/i.test(trimmed);
        elements.push(
            <p key={elements.length} className={`my-1 ${isCentered ? 'text-center' : ''}`}>
                <BoldText text={trimmed} />
            </p>
        );
        i++;
    }

    return <>{elements}</>;
}

function MarkdownTable({ lines }: { lines: string[] }) {
    const parseCells = (line: string) => line.split('|').slice(1, -1).map(c => c.trim());
    const isSeparator = (line: string) => /^\|[\s\-:|]+\|$/.test(line);

    const headerCells = parseCells(lines[0]);
    const dataStart = lines.length > 1 && isSeparator(lines[1]) ? 2 : 1;
    const dataLines = lines.slice(dataStart).filter(l => !isSeparator(l));

    return (
        <table className="w-full text-xs border-collapse my-2">
            <thead>
                <tr className="border-b border-gray-400">
                    {headerCells.map((cell, j) => (
                        <th key={j} className="text-left py-1 px-2 font-bold">
                            <BoldText text={cell} />
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {dataLines.map((line, idx) => {
                    const cells = parseCells(line);
                    return (
                        <tr key={idx} className="border-b border-gray-200">
                            {headerCells.map((_, j) => (
                                <td key={j} className="py-1 px-2">
                                    <BoldText text={cells[j] ?? ''} />
                                </td>
                            ))}
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

/** Renders text with **bold** segments */
function BoldText({ text }: { text: string }) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return (
        <>
            {parts.map((part, i) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={i}>{part.slice(2, -2)}</strong>;
                }
                return <span key={i}>{part}</span>;
            })}
        </>
    );
}

import { el } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';
import { Document, Paragraph, TextRun, HeadingLevel, ExternalHyperlink, Packer, AlignmentType } from 'docx';
import { formatTimestamp } from '@/lib/utils';
import { getSpeakerLabels, type RoleTitles } from '@/lib/utils/roles';
import { getShortName } from '@/lib/formatters/name';
import { MeetingDataForExport } from '@/lib/export/meetings';
import { getRealmDomain } from '@/lib/realm';

const createTitlePage = ({ meeting, city }: Pick<MeetingDataForExport, 'meeting' | 'city'>) => {
    return [
        new Paragraph({ spacing: { before: 2880 } }),

        new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            children: [
                new TextRun({
                    text: meeting.name,
                    size: 32, // 16pt
                    bold: true
                })
            ],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [new TextRun({
                text: city.name_municipality,
                size: 28 // 14pt
            })],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 480 },
            children: [new TextRun({
                text: formatInTimeZone(meeting.dateTime, city.timezone, 'EEEE, d MMMM yyyy, HH:mm', { locale: el }),
                size: 24 // 12pt
            })],
        }),

        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 480, after: 240 },
            children: [new TextRun({
                text: 'Προσοχή: Ανεπίσημο έγγραφο',
                color: 'FF6B00',
                bold: true,
                size: 24 // 12pt
            })],
        }),

        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 480 },
            children: [
                new TextRun({
                    text: 'Προτιμήστε την online έκδοση: ',
                    size: 20 // 10pt
                }),
                new ExternalHyperlink({
                    children: [new TextRun({
                        // getRealmDomain, not realmBaseUrl: this renderer is
                        // reachable from a client module, and a document handed
                        // to a municipality should name production, not a preview.
                        text: `${getRealmDomain(city.realm)}/${meeting.cityId}/${meeting.id}`,
                        style: 'Hyperlink',
                        size: 20 // 10pt
                    })],
                    link: `https://${getRealmDomain(city.realm)}/${meeting.cityId}/${meeting.id}`
                }),
            ],
        }),

        // Page break
        new Paragraph({
            pageBreakBefore: true,
        }),
    ];
};

const createTranscriptSection = ({ transcript, people, meeting }: Pick<MeetingDataForExport, 'transcript' | 'people' | 'meeting'>, roleTitles: RoleTitles) => {
    const paragraphs = [
        new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 480, after: 240 },
            children: [new TextRun({
                text: 'Απομαγνητοφώνηση',
                size: 28 // 14pt
            })],
        }),
    ];

    transcript.forEach((speakerSegment) => {
        const speaker = speakerSegment.speakerTag.personId ? people.find(p => p.id === speakerSegment.speakerTag.personId) : null;
        const speakerName = speaker ? (speaker.name_short || getShortName(speaker.name)) : speakerSegment.speakerTag.label;
        const { partyLabel, role } = getSpeakerLabels(speaker?.roles ?? [], roleTitles, new Date(meeting.dateTime));

        const children = [
            new TextRun({
                text: `${speakerName} ${partyLabel ? `(${partyLabel}) ` : ''}`,
                bold: true,
                size: 24 // 12pt
            }),
        ];

        if (role) {
            children.push(new TextRun({
                text: `${role} `,
                size: 20, // 10pt
                color: '666666'
            }));
        }

        children.push(new TextRun({
            text: formatTimestamp(speakerSegment.startTimestamp),
            size: 20, // 10pt
            color: '666666'
        }));

        // Add the utterance text with proper line break
        children.push(new TextRun({
            text: speakerSegment.utterances.map(u => u.text).join(' '),
            size: 24, // 12pt
            break: 1
        }));

        paragraphs.push(new Paragraph({
            children,
            spacing: { before: 240, after: 240 }
        }));
    });

    return paragraphs;
};

/** `roleTitles` in the city's language: the municipality reads this document. */
export const renderDocx = async ({ meeting, transcript, people, city }: MeetingDataForExport, roleTitles: RoleTitles) => {
    const doc = new Document({
        creator: "OpenCouncil",
        description: "Council Meeting Transcript",
        title: meeting.name,
        subject: "Council Meeting",
        keywords: ["council", "meeting", "transcript"].join(", "),
        lastModifiedBy: "OpenCouncil",
        sections: [{
            properties: {},
            children: [
                ...createTitlePage({ meeting, city }),
                ...createTranscriptSection({ transcript, people, meeting }, roleTitles),
            ],
        }],
    });

    const blob = await Packer.toBlob(doc);
    return {
        save: async () => blob
    };
}; 
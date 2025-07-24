import { City, CouncilMeeting, Party, Person, SpeakerTag } from '@prisma/client';
import { Transcript } from '@/lib/db/transcript';
import { el } from 'date-fns/locale';
import { format } from 'date-fns';
import { Document, Paragraph, TextRun, HeadingLevel, ExternalHyperlink, Packer, AlignmentType } from 'docx';
import { PersonWithRelations } from '@/lib/db/people';
import { getPartyFromRoles } from '@/lib/utils';

const formatTimestamp = (timestamp: number) => {
    const hours = Math.floor(timestamp / 3600);
    const minutes = Math.floor((timestamp % 3600) / 60);
    const seconds = Math.floor(timestamp % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const createTitlePage = (meeting: CouncilMeeting, city: City) => {
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
                text: format(meeting.dateTime, 'EEEE, d MMMM yyyy, HH:mm', { locale: el }),
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
            spacing: { after: 480 },
            children: [new TextRun({
                text: 'Το παρόν δημιουργήθηκε αυτοματοποιημένα από το OpenCouncil.gr, και ενδέχεται να περιέχει λάθη',
                color: '666666',
                size: 20 // 10pt
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
                        text: `opencouncil.gr/${meeting.cityId}/${meeting.id}`,
                        style: 'Hyperlink',
                        size: 20 // 10pt
                    })],
                    link: `https://opencouncil.gr/${meeting.cityId}/${meeting.id}`
                }),
            ],
        }),

        // Page break
        new Paragraph({
            pageBreakBefore: true,
        }),
    ];
};

const createTranscriptSection = (transcript: Transcript, people: (PersonWithRelations | any)[], parties: Party[]) => {
    const paragraphs = [
        new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 480, after: 240 },
            children: [new TextRun({
                text: 'Αυτόματη απομαγνητοφώνηση',
                size: 28 // 14pt
            })],
        }),
    ];

    transcript.forEach((speakerSegment) => {
        const speaker = speakerSegment.speakerTag.personId ? people.find(p => p.id === speakerSegment.speakerTag.personId) : null;
        const speakerName = speaker ? `${speaker.name_short}` : speakerSegment.speakerTag.label;
        const party = speaker ? getPartyFromRoles(speaker.roles || []) : null;

        const children = [
            new TextRun({
                text: `${speakerName} ${party ? `(${party.name_short})` : ''} `,
                bold: true,
                size: 24 // 12pt
            }),
        ];

        if (speaker?.role) {
            children.push(new TextRun({
                text: `${speaker.role} `,
                size: 20, // 10pt
                color: '666666'
            }));
        }

        children.push(new TextRun({
            text: formatTimestamp(speakerSegment.startTimestamp),
            size: 20, // 10pt
            color: '666666'
        }));

        // Add the utterance text with proper spacing
        children.push(new TextRun({
            text: '\n' + speakerSegment.utterances.map(u => u.text).join(' '),
            size: 24 // 12pt
        }));

        paragraphs.push(new Paragraph({
            children,
            spacing: { before: 240, after: 240 }
        }));
    });

    return paragraphs;
};

export const renderDocx = async ({ meeting, transcript, people, parties, speakerTags, city }: {
    city: City,
    meeting: CouncilMeeting,
    transcript: Transcript,
    people: PersonWithRelations[],
    parties: Party[],
    speakerTags: SpeakerTag[]
}) => {
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
                ...createTitlePage(meeting, city),
                ...createTranscriptSection(transcript, people, parties),
            ],
        }],
    });

    const blob = await Packer.toBlob(doc);
    return {
        save: async () => blob
    };
}; 
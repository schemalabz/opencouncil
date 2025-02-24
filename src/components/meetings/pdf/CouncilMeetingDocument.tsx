import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font } from '@react-pdf/renderer';
import { Image, Link } from '@react-pdf/renderer';
import { City, CouncilMeeting, Party, Person, SpeakerTag } from '@prisma/client';
import { Transcript } from '@/lib/db/transcript';
import { el } from 'date-fns/locale';
import { format } from 'date-fns';


// Register Font
Font.register({
    family: "Roboto",
    src:
        "https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-light-webfont.ttf"
});

Font.register({
    family: "Mono",
    src: "/RobotoMono.ttf"
})

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        marginLeft: 20,
        marginTop: 20,
    },
    logo: {
        width: 50,
        height: 50,
    },
    headerText: {
        marginLeft: 10,
        fontSize: 18,
        fontWeight: 'bold',
    },
    page: {
        fontFamily: "Roboto",
        padding: 20,
    },
    disclaimer: {
        fontSize: 10,
        textAlign: "center",
        marginTop: 10,
        marginBottom: 10,
    }
});

export const TitlePage = ({ meeting, city }: { meeting: CouncilMeeting, city: City }) => {
    return <Page size="A4" style={styles.page}>
        <View style={styles.header}>
            <View style={{ flexDirection: 'column', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {/* eslint-disable-next-line jsx-a11y/alt-text */}
                        <Image
                            style={styles.logo}
                            src="/logo.png"
                        />
                        <Text style={styles.headerText}>OpenCouncil</Text>
                    </View>
                    <View style={{ flexDirection: 'column', alignItems: 'center', fontSize: 12 }}>
                        <Text>Προτιμήστε την online έκδοση</Text>
                        <Link src={`https://opencouncil.gr/${meeting.cityId}/${meeting.id}`}>opencouncil.gr/{meeting.cityId}/{meeting.id}</Link>
                    </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 30 }}>
                    <View style={{ textAlign: 'center', border: '1px solid orange', padding: 10, marginTop: 10, fontSize: 8, backgroundColor: 'rgba(255, 165, 0, 0.2)', alignSelf: 'center', width: '100%' }}>
                        <Text>Προσοχή: Ανεπίσημο έγγραφο</Text>
                        <Text>Το παρόν δημιουργήθηκε αυτοματοποιημένα από το OpenCouncil.gr, και ενδέχεται να περιέχει λάθη</Text>
                    </View>
                </View>

                <View style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: 30 }}>
                    <Text style={{ fontSize: 24, fontWeight: 'bold' }}>{meeting.name}</Text>
                    <Text style={{ fontSize: 12, fontWeight: 'normal' }}>{city.name_municipality}</Text>
                    <Text style={{ fontSize: 12, fontWeight: 'normal' }}>{format(meeting.dateTime, 'EEEE, d MMMM yyyy, HH:mm', { locale: el })}</Text>
                </View>
            </View>
        </View>
    </Page>
}

const formatTimestamp = (timestamp: number) => {
    const hours = Math.floor(timestamp / 3600);
    const minutes = Math.floor((timestamp % 3600) / 60);
    const seconds = Math.floor(timestamp % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const TranscriptPage = ({ meeting, transcript, people, parties, speakerTags }: { meeting: CouncilMeeting, transcript: Transcript, people: Person[], parties: Party[], speakerTags: SpeakerTag[] }) => {
    return <Page size="A4" style={styles.page}>
        <Text>Αυτόματη απομαγνητοφώνηση</Text>
        {transcript.map((speakerSegment, index) => {
            const speaker = speakerSegment.speakerTag.personId ? people.find(p => p.id === speakerSegment.speakerTag.personId) : null;
            const speakerName = speaker ? `${speaker.name_short}` : speakerSegment.speakerTag.label;
            const party = speaker?.partyId ? parties.find(p => p.id === speaker.partyId) : null;
            const color = party ? party.colorHex : 'gray';
            return <View key={index} style={{ marginBottom: 10, flexDirection: 'column', alignItems: 'flex-start', borderLeftWidth: 2, borderLeftColor: color, paddingLeft: 5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', fontSize: 10, justifyContent: 'space-between', width: '100%' }}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                        <View>
                            <Text style={{ fontWeight: 'bold' }}>{speakerName} {party ? `(${party.name_short})` : ''}</Text>
                        </View>
                        <View>
                            <Text style={{ fontSize: 8, color: "black" }}>{speaker?.role ? `${speaker.role}` : ''}</Text>
                        </View>
                    </View>
                    <View>
                        <Text style={{ fontSize: 8, color: "black" }}>{formatTimestamp(speakerSegment.startTimestamp)}</Text>
                    </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', fontSize: 8, }}>
                    <View style={{ flexBasis: '65%', textAlign: 'justify' }}>
                        <Text style={{ fontFamily: "Mono" }}>{speakerSegment.utterances.map((u) => u.text).join(' ')}</Text>
                    </View>
                    <View style={{ flexBasis: '10%' }}></View>
                    <View style={{ flexBasis: '25%', color: 'gray', borderLeftWidth: 1, borderLeftColor: 'gray', paddingLeft: 5, textAlign: 'justify' }}>
                        <Text>{speakerSegment.summary ? speakerSegment.summary.text : ''}</Text>
                    </View>
                </View>
            </View>
        })}
    </Page>
}

export const CouncilMeetingDocument = ({ meeting, transcript, people, parties, speakerTags, city }: { city: City, meeting: CouncilMeeting, transcript: Transcript, people: Person[], parties: Party[], speakerTags: SpeakerTag[] }) => {
    return (
        <Document>
            <TitlePage meeting={meeting} city={city} />
            <TranscriptPage meeting={meeting} transcript={transcript} people={people} parties={parties} speakerTags={speakerTags} />
        </Document>
    );
}

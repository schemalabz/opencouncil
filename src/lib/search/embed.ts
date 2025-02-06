"use server";
import { City, CouncilMeeting } from "@prisma/client";
import { getTranscript, updateEmbeddings } from "../db/transcript";
import { getEmbeddings } from "../voyage/voyage";

export async function embedCouncilMeeting(cityId: City["id"], councilMeetingId: CouncilMeeting["id"]) {
    const transcript = await getTranscript(councilMeetingId, cityId, { joinAdjacentSameSpeakerSegments: true });

    const documentsToEmbed = transcript.map(ss => ss.utterances.map(u => u.text).join(" "));
    const embeddings = (await getEmbeddings(documentsToEmbed)).map((embedding, i) => ({
        speakerSegmentId: transcript[i].id,
        embedding
    }));

    await updateEmbeddings(embeddings);

}
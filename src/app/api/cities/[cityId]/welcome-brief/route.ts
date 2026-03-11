import { NextResponse } from 'next/server';
import { getSubjectsForWelcomeBrief } from '@/lib/db/welcomeBrief';
import { aiChat } from '@/lib/ai';
import { formatDate } from '@/lib/formatters/time';

export async function POST(
    request: Request,
    { params }: { params: { cityId: string } }
) {
    const body = await request.json();
    const { topicIds } = body;

    if (!Array.isArray(topicIds) || !topicIds.every((id): id is string => typeof id === 'string')) {
        return NextResponse.json({ error: 'Invalid topicIds' }, { status: 400 });
    }

    const since = new Date();
    since.setMonth(since.getMonth() - 6);

    const data = await getSubjectsForWelcomeBrief(params.cityId, topicIds, since);

    if (data.matchedSubjects.length === 0) {
        return NextResponse.json({ brief: null });
    }

    const systemPrompt = `You are a friendly expert on local government who follows municipal council meetings closely.
A new resident just signed up for notifications about their city council.
Your job: write them a short, engaging catch-up in Greek — like a smart friend who follows local politics, not an official report. Be warm, direct, and concrete.
Use markdown (headers, bullets). Stay under 300 words.
Return your response as a JSON object with this exact format: {"brief": "your markdown text here"}`;

    const topicNames = [...new Set(data.matchedSubjects.map(s => s.topicName))].join(', ');

    const subjectLines = data.matchedSubjects.map(s => {
        const date = formatDate(s.meetingDate);
        let line = `📅 ${date} — ${s.meetingName}\nΘέμα: ${s.subjectName} (Κατηγορία: ${s.topicName})`;
        if (s.description) line += `\n${s.description}`;
        if (s.context) line += `\n${s.context}`;
        if (s.hot) line += '\n⚡ Καυτό θέμα';
        return line;
    }).join('\n---\n');

    const userPrompt = `Πόλη: ${data.cityName}
Ενδιαφέροντα: ${topicNames}

Τελευταίοι 6 μήνες:
- Συνολικές συνεδριάσεις: ${data.totalMeetingCount}
- Συζητήσεις σε θέματα που σε αφορούν: ${data.matchedSubjectCount}

Σχετικές συζητήσεις:
${subjectLines}`;

    const { result } = await aiChat<{ brief: string }>(
        systemPrompt,
        userPrompt,
        undefined,
        undefined,
        { maxTokens: 1024 }
    );

    return NextResponse.json({ brief: result.brief });
}

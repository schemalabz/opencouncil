'use server';
import prisma from './prisma';

export async function editWord(wordId: string, newText: string) {
    try {
        const updatedWord = await prisma.word.update({
            where: { id: wordId },
            data: { text: newText },
        });

        // Recalculate the text of the parent Utterance
        const utterance = await prisma.utterance.findUnique({
            where: { id: updatedWord.utteranceId },
            include: {
                words: {
                    orderBy: {
                        startTimestamp: 'asc',
                    },
                }
            },
        });

        if (utterance) {
            const newUtteranceText = utterance.words.map(w => w.text).join(' ');
            await prisma.utterance.update({
                where: { id: utterance.id },
                data: { text: newUtteranceText },
            });
        }

        return updatedWord;
    } catch (error) {
        console.error('Error editing word:', error);
        throw new Error('Failed to edit word');
    }
}

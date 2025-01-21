'use server';
import prisma from './prisma';
import { withUserAuthorizedToEdit } from '../auth';
import { Utterance } from '@prisma/client';

export async function editUtterance(utteranceId: string, newText: string): Promise<Utterance> {
    try {
        const utterance = await prisma.utterance.findUnique({
            where: { id: utteranceId },
            include: {
                speakerSegment: true
            }
        });

        if (!utterance) {
            throw new Error('Utterance not found');
        }

        withUserAuthorizedToEdit({ cityId: utterance.speakerSegment.cityId });

        const updatedUtterance = await prisma.utterance.update({
            where: { id: utteranceId },
            data: {
                text: newText,
                lastModifiedBy: 'user'
            },
        });

        return updatedUtterance;
    } catch (error) {
        console.error('Error editing utterance:', error);
        throw new Error('Failed to edit utterance');
    }
} 
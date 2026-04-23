"use server";
import { Prisma, Topic } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { ConflictError } from "../api/errors";

const topicWithSubjectCountInclude = {
    _count: {
        select: {
            subjects: true,
            topicLabels: true,
            notificationPreferences: true,
        },
    },
} satisfies Prisma.TopicInclude;

export type TopicWithSubjectCount = Prisma.TopicGetPayload<{ include: typeof topicWithSubjectCountInclude }>;

/**
 * Returns all active (non-deprecated) topics.
 * For admin views that need deprecated topics too, use getAllTopicsWithSubjectCount.
 */
export async function getTopics(): Promise<Topic[]> {
    try {
        const topics = await prisma.topic.findMany({
            where: { deprecated: false },
            orderBy: { name: 'asc' }
        });
        return topics;
    } catch (error) {
        console.error('Error fetching topics:', error);
        throw new Error('Failed to fetch topics');
    }
}

export async function getAllTopicsWithSubjectCount(): Promise<TopicWithSubjectCount[]> {
    try {
        const topics = await prisma.topic.findMany({
            orderBy: { name: 'asc' },
            include: topicWithSubjectCountInclude,
        });
        return topics;
    } catch (error) {
        console.error('Error fetching topics with counts:', error);
        throw new Error('Failed to fetch topics');
    }
}

export type TopicInput = Pick<Prisma.TopicCreateInput, 'name' | 'name_en' | 'colorHex' | 'icon' | 'description' | 'deprecated'>;


export async function createTopic(data: TopicInput): Promise<Topic> {
    await withUserAuthorizedToEdit({});
    return prisma.topic.create({ data });
}

export async function updateTopic(id: string, data: Partial<TopicInput>): Promise<Topic> {
    await withUserAuthorizedToEdit({});
    return prisma.topic.update({ where: { id }, data });
}

export async function deleteTopic(id: string): Promise<void> {
    await withUserAuthorizedToEdit({});

    await prisma.$transaction(async (tx) => {
        const [subjectCount, labelCount, notificationCount] = await Promise.all([
            tx.subject.count({ where: { topicId: id } }),
            tx.topicLabel.count({ where: { topicId: id } }),
            tx.notificationPreference.count({ where: { interests: { some: { id } } } }),
        ]);

        if (subjectCount > 0 || labelCount > 0 || notificationCount > 0) {
            const parts: string[] = [];
            if (subjectCount > 0) parts.push(`${subjectCount} subject(s)`);
            if (labelCount > 0) parts.push(`${labelCount} topic label(s)`);
            if (notificationCount > 0) parts.push(`${notificationCount} notification preference(s)`);
            throw new ConflictError(
                `Cannot delete topic: it is still referenced by ${parts.join(', ')}.`
            );
        }

        await tx.topic.delete({ where: { id } });
    });
}

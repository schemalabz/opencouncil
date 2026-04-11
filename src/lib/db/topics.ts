"use server";
import { Topic } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { ConflictError } from "../api/errors";

export type TopicWithSubjectCount = Topic & {
    _count: {
        subjects: number;
        topicLabels: number;
    };
};

export async function getAllTopics(): Promise<Topic[]> {
    try {
        const topics = await prisma.topic.findMany({
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
            include: {
                _count: {
                    select: { subjects: true, topicLabels: true },
                },
            },
        });
        return topics;
    } catch (error) {
        console.error('Error fetching topics with counts:', error);
        throw new Error('Failed to fetch topics');
    }
}

export type TopicInput = {
    name: string;
    name_en: string;
    colorHex: string;
    icon?: string | null;
    description: string;
    deprecated?: boolean;
};

export async function getActiveTopicsForTasks(): Promise<Topic[]> {
    try {
        const topics = await prisma.topic.findMany({
            where: { deprecated: false },
            orderBy: { name: 'asc' },
        });
        return topics;
    } catch (error) {
        console.error('Error fetching active topics:', error);
        throw new Error('Failed to fetch active topics');
    }
}

export async function createTopic(data: TopicInput): Promise<Topic> {
    await withUserAuthorizedToEdit({});
    return prisma.topic.create({
        data: {
            name: data.name,
            name_en: data.name_en,
            colorHex: data.colorHex,
            icon: data.icon ?? null,
            description: data.description,
            deprecated: data.deprecated ?? false,
        },
    });
}

export async function updateTopic(id: string, data: Partial<TopicInput>): Promise<Topic> {
    await withUserAuthorizedToEdit({});
    return prisma.topic.update({
        where: { id },
        data: {
            ...(data.name !== undefined && { name: data.name }),
            ...(data.name_en !== undefined && { name_en: data.name_en }),
            ...(data.colorHex !== undefined && { colorHex: data.colorHex }),
            ...(data.icon !== undefined && { icon: data.icon }),
            ...(data.description !== undefined && { description: data.description }),
            ...(data.deprecated !== undefined && { deprecated: data.deprecated }),
        },
    });
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

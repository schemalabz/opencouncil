"use server";
import { Prisma, Realm, Topic } from '@prisma/client';
import prisma from "./prisma";
import { getAdminRealms } from "../auth";
import { ConflictError, ForbiddenError, NotFoundError } from "../api/errors";

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
 * Returns all active (non-deprecated) topics for a realm. Topics are a
 * realm-specific taxonomy (the Greek set references Greek-only institutions),
 * so callers must pass the city's / request's realm.
 * For admin views that need deprecated + cross-realm topics, use
 * getAllTopicsWithSubjectCount.
 */
export async function getTopics(realm: Realm): Promise<Topic[]> {
    try {
        const topics = await prisma.topic.findMany({
            where: { deprecated: false, realm },
            orderBy: { name: 'asc' }
        });
        return topics;
    } catch (error) {
        console.error('Error fetching topics:', error);
        throw new Error('Failed to fetch topics');
    }
}

/**
 * Every topic of the realms the viewer administers, deprecated ones included.
 * A "use server" export, so it reads the viewer's realms itself instead of
 * taking them from the caller.
 */
export async function getAllTopicsWithSubjectCount(): Promise<TopicWithSubjectCount[]> {
    const realms = await getAdminRealms();
    try {
        const topics = await prisma.topic.findMany({
            where: realms ? { realm: { in: realms } } : {},
            orderBy: { name: 'asc' },
            include: topicWithSubjectCountInclude,
        });
        return topics;
    } catch (error) {
        console.error('Error fetching topics with counts:', error);
        throw new Error('Failed to fetch topics');
    }
}

// The realm is required, not defaulted: createTopic checks it against the viewer's realms.
export type TopicInput = Pick<Prisma.TopicCreateInput, 'name' | 'name_en' | 'colorHex' | 'icon' | 'description' | 'deprecated'> & { realm: Realm };


/** Throws unless the viewer administers the realm; a superadmin administers every realm. */
function assertRealmAdministered(realms: Realm[] | null, realm: Realm): void {
    if (realms && !realms.includes(realm)) {
        throw new ForbiddenError(`Not an administrator of the ${realm} realm`);
    }
}

/** The realm of the topic, which must be one the viewer administers. */
async function topicInAdministeredRealm(id: string, realms: Realm[] | null): Promise<Realm> {
    const topic = await prisma.topic.findUnique({ where: { id }, select: { realm: true } });
    if (!topic) throw new NotFoundError('Topic not found');
    assertRealmAdministered(realms, topic.realm);
    return topic.realm;
}

export async function createTopic(data: TopicInput): Promise<Topic> {
    assertRealmAdministered(await getAdminRealms(), data.realm);
    return prisma.topic.create({ data });
}

export async function updateTopic(id: string, data: Partial<TopicInput>): Promise<Topic> {
    const realms = await getAdminRealms();
    const realm = await topicInAdministeredRealm(id, realms);
    // Only a superadmin moves a topic between realms: the target realm may be one the viewer does not hold.
    if (realms && data.realm !== undefined && data.realm !== realm) {
        throw new ForbiddenError('Only a superadmin can move a topic to another realm');
    }
    return prisma.topic.update({ where: { id }, data });
}

export async function deleteTopic(id: string): Promise<void> {
    await topicInAdministeredRealm(id, await getAdminRealms());

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

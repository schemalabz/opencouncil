// Server-only: populateCity takes no identity and checks no session. The
// caller authorizes first — the MCP admin tool populate_city does.
import "server-only";
import { defaultNotificationBehavior, defaultTierOf } from '@/lib/utils/bodyTier';
import { youthCouncilOnly } from '@/lib/utils/youthCouncil';
import type { Prisma } from '@prisma/client';
import prisma from './prisma';
import type { RoleOfPerson } from './personImage';
import { ApiError, BadRequestError, NotFoundError } from '@/lib/api/errors';
import { deleteStoredImages, imageStorageProblem, RemoteImageError, StoredImageWriteError, storeRemoteImage } from '@/lib/storedImages';
import { mapSettled } from '@/lib/utils/mapSettled';
import { isStoredImageUrl } from '@/lib/utils/storedImageUrl';
import type { CityPopulationData } from '@/lib/zod-schemas/cityPopulation';

type CityPopulationStats = {
    partiesCount: number;
    peopleCount: number;
    rolesCount: number;
    adminBodiesCount: number;
};

type StoredImages = { personImages: (string | null)[]; partyLogos: (string | null)[]; keys: string[] };

// Copies in flight at once: a municipality's server can refuse a burst of
// sixty photo requests, and one refusal refuses the whole call.
const COPY_CONCURRENCY = 4;

/**
 * Copy every photo and logo of the payload that is not on our storage into
 * it: the site draws images from our storage only. A URL that cannot be
 * copied refuses the whole call, with every such URL named, and nothing
 * copied is kept. A person on youth councils only gets no photo: they add
 * their own from their account (#829, db/personImage.ts).
 */
async function storeImportedImages(data: CityPopulationData): Promise<StoredImages> {
    const bodyType = new Map(data.administrativeBodies.map(body => [body.name, body.type]));
    const rolesOf = (person: CityPopulationData['people'][number]): RoleOfPerson[] => (person.roles ?? []).map(role => {
        const type = role.type === 'adminBody' && role.administrativeBodyName ? bodyType.get(role.administrativeBodyName) : undefined;
        return { administrativeBody: type ? { type } : null };
    });
    const jobs = [
        ...data.parties.map(party => ({ url: party.logo, label: `logo of ${party.name}`, kind: 'partyLogo' as const })),
        ...data.people.map(person => ({
            url: youthCouncilOnly(rolesOf(person)) ? null : person.image,
            label: `photo of ${person.name}`,
            kind: 'personImage' as const,
        })),
    ];
    if (jobs.some(job => job.url && !isStoredImageUrl(job.url))) {
        const problem = imageStorageProblem();
        if (problem) throw new BadRequestError(`The images cannot be copied to our storage: ${problem}. Pass null for each photo and logo, or use a deployment with storage.`);
    }

    const results = await mapSettled(jobs, COPY_CONCURRENCY, job => job.url ? storeRemoteImage(job.url, job.kind) : Promise.resolve(null));
    const keys = results.flatMap(result => result.status === 'fulfilled' && result.value?.key ? [result.value.key] : []);
    const failures = results.flatMap((result, index) => result.status === 'rejected' ? [{ job: jobs[index], error: result.reason as unknown }] : []);
    if (failures.length > 0) {
        await deleteStoredImages(keys);
        const unexpected = failures.filter(({ error }) => !(error instanceof RemoteImageError) && !(error instanceof StoredImageWriteError));
        for (const { job, error } of unexpected) console.error(`[populate] copying the ${job.label} failed:`, error);
        // A programming error is not the URL's fault nor storage's: it reaches the caller as an internal error.
        if (unexpected.length > 0) throw unexpected[0].error;
        const problems = failures.flatMap(({ job, error }) => error instanceof RemoteImageError ? [`${job.label}: ${error.message}`] : []);
        const urlProblems = problems.length > 0 ? ` Fix each URL, or pass null: ${problems.join('; ')}` : '';
        const storageFailure = failures.find(({ error }) => error instanceof StoredImageWriteError);
        if (storageFailure) {
            console.error('[populate] storing an image copy failed:', storageFailure.error);
            throw new ApiError(502, `Our storage refused an image copy (${(storageFailure.error as Error).message}); nothing was saved. Try again later.${urlProblems}`);
        }
        throw new BadRequestError(`These images could not be copied to our storage.${urlProblems}`);
    }
    const urls = results.map(result => result.status === 'fulfilled' ? result.value?.url ?? null : null);
    return { partyLogos: urls.slice(0, data.parties.length), personImages: urls.slice(data.parties.length), keys };
}

type RowCounts = Pick<Prisma.TransactionClient, 'party' | 'person' | 'councilMeeting' | 'role'>;

async function assertNoCityData(db: RowCounts, cityId: string): Promise<void> {
    const existingRows = await Promise.all([
        db.party.count({ where: { cityId } }),
        db.person.count({ where: { cityId } }),
        db.councilMeeting.count({ where: { cityId } }),
        db.role.count({ where: { cityId } }),
    ]);
    if (existingRows.some(count => count > 0)) throw new BadRequestError('City already has data');
}

/**
 * Save the parties, administrative bodies, people and roles of an empty city.
 *
 * The emptiness check runs inside the transaction, after a lock on the city
 * row. Two calls for the same city — a retry, or two administrators — then
 * serialize on that lock, and the second one sees what the first wrote. A
 * check before the transaction would let both pass and the city would hold
 * its council twice.
 */
export async function populateCity(validatedData: CityPopulationData): Promise<CityPopulationStats> {
    const { cityId } = validatedData;
    // An early refusal, so that a retry on a filled city copies no image. The
    // checks under the lock below are the ones that hold.
    if (await prisma.city.count({ where: { id: cityId } }) === 0) throw new NotFoundError('City not found');
    await assertNoCityData(prisma, cityId);
    // Copied before the transaction, which must not wait on other hosts. A
    // call that the transaction then refuses leaves no copy behind.
    const images = await storeImportedImages(validatedData);
    try {
        return await writePopulation(validatedData, images);
    } catch (error) {
        // A refusal under the lock is an ApiError, and nothing was written.
        // Any other error can come after the commit (the connection drops while
        // Postgres acknowledges it): the copies stay while the city has rows.
        if (!(error instanceof ApiError) && await cityHasRows(cityId)) {
            console.error(`[populate] ${cityId}: the write failed but the city has rows; keeping ${images.keys.length} image copies`, error);
        } else {
            await deleteStoredImages(images.keys);
        }
        throw error;
    }
}

// The emptiness check throws when the city has rows. Any other failure leaves
// the answer unknown, and keeping the copies is then the safe side.
function cityHasRows(cityId: string): Promise<boolean> {
    return assertNoCityData(prisma, cityId).then(() => false, () => true);
}

function writePopulation(validatedData: CityPopulationData, images: StoredImages): Promise<CityPopulationStats> {
    const { cityId } = validatedData;
    return prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "City" WHERE id = ${cityId} FOR UPDATE`;
        if (locked.length === 0) throw new NotFoundError('City not found');

        await assertNoCityData(tx, cityId);

        const adminBodies = await Promise.all(
            validatedData.administrativeBodies.map(adminBody => {
                const tier = adminBody.tier ?? defaultTierOf(adminBody.type);
                return tx.administrativeBody.create({
                    data: {
                        name: adminBody.name,
                        name_en: adminBody.name_en,
                        type: adminBody.type,
                        tier,
                        notificationBehavior: defaultNotificationBehavior(tier),
                        diavgeiaUnitIds: adminBody.diavgeiaUnitIds ?? [],
                        youtubeChannelUrl: adminBody.youtubeChannelUrl ?? null,
                        cityId: cityId,
                    },
                });
            })
        );

        const parties = await Promise.all(
            validatedData.parties.map((party, partyIndex) =>
                tx.party.create({
                    data: {
                        name: party.name,
                        name_en: party.name_en,
                        name_short: party.name_short,
                        name_short_en: party.name_short_en,
                        colorHex: party.colorHex,
                        logo: images.partyLogos[partyIndex],
                        cityId: cityId,
                    },
                })
            )
        );

        // A person on a youth council alone has no stored photo (storeImportedImages).
        const people = await Promise.all(
            validatedData.people.map((person, personIndex) =>
                tx.person.create({
                    data: {
                        name: person.name,
                        name_en: person.name_en,
                        name_short: person.name_short,
                        name_short_en: person.name_short_en,
                        image: images.personImages[personIndex],
                        profileUrl: person.profileUrl,
                        cityId: cityId
                    },
                })
            )
        );

        await Promise.all(
            validatedData.people.flatMap((personData, personIndex) => {
                const person = people[personIndex];
                if (!personData.roles) return [];

                return personData.roles.map(role => {
                    const party = role.partyName
                        ? parties.find(p => p.name === role.partyName)
                        : null;

                    const adminBody = role.administrativeBodyName
                        ? adminBodies.find(ab => ab.name === role.administrativeBodyName)
                        : null;

                    return tx.role.create({
                        data: {
                            personId: person.id,
                            name: role.name,
                            name_en: role.name_en,
                            isHead: role.isHead || false,
                            startDate: role.startDate,
                            endDate: role.endDate,
                            electedOrder: role.electedOrder ?? null,
                            cityId: role.type === 'city' ? cityId : null,
                            partyId: role.type === 'party' ? party?.id : null,
                            administrativeBodyId: role.type === 'adminBody' ? adminBody?.id : null,
                        },
                    });
                });
            })
        );

        // Importing data does not publish the city — a superadmin promotes it to
        // demo or supported once the import has been checked. Written explicitly
        // rather than left alone because populate_city accepts an empty city of
        // any status.
        await tx.city.update({
            where: { id: cityId },
            data: { status: 'pending' },
        });

        const totalRoles = validatedData.people.reduce((count, person) => count + (person.roles?.length || 0), 0);

        return {
            partiesCount: parties.length,
            peopleCount: people.length,
            rolesCount: totalRoles,
            adminBodiesCount: adminBodies.length,
        };
    }, {
        // A full council (a large city can have 60+ members, each with several
        // roles) is hundreds of sequential inserts; against a remote DB that
        // overruns Prisma's default 5s interactive-transaction timeout.
        maxWait: 10_000,
        timeout: 60_000,
    });
}

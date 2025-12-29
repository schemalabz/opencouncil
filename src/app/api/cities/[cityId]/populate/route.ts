import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { canUseCityCreator, getCity } from '@/lib/db/cities';
import prisma from '@/lib/db/prisma';
import { AdministrativeBodyType } from '@prisma/client';
import { revalidateTag } from 'next/cache';

// Zod schema for city JSON validation
const cityPopulationSchema = z.object({
    cityId: z.string(),
    parties: z.array(z.object({
        name: z.string(),
        name_en: z.string(),
        name_short: z.string(),
        name_short_en: z.string(),
        colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        logo: z.string().nullable().optional(),
    })),
    administrativeBodies: z.array(z.object({
        name: z.string(),
        name_en: z.string(),
        type: z.enum(['council', 'committee', 'community']),
    })),
    people: z.array(z.object({
        name: z.string(),
        name_en: z.string(),
        name_short: z.string(),
        name_short_en: z.string(),
        image: z.string().nullable().optional(),
        activeFrom: z.string().nullable().optional(),
        activeTo: z.string().nullable().optional(),
        profileUrl: z.string().nullable().optional(),
        partyName: z.string().nullable().optional(),
        roles: z.array(z.object({
            type: z.enum(['party', 'city', 'adminBody']),
            name: z.union([z.string(), z.null()]).transform(val => (typeof val === 'string' && val.trim()) || null).optional(),
            name_en: z.union([z.string(), z.null()]).transform(val => (typeof val === 'string' && val.trim()) || null).optional(),
            isHead: z.boolean().optional(),
            partyName: z.string().nullable().optional(),
            administrativeBodyName: z.string().nullable().optional(),
        })).optional(),
    })),
});

// GET: Load initial empty structure
export async function GET(
    request: NextRequest,
    { params }: { params: { cityId: string } }
) {
    try {
        const user = await getCurrentUser();

        if (!user?.isSuperAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if city can use city creator
        const canUseCreator = await canUseCityCreator(params.cityId);
        if (!canUseCreator) {
            // Check if city exists to provide appropriate error message
            const city = await getCity(params.cityId);
            if (!city) {
                return NextResponse.json({ error: 'City not found' }, { status: 404 });
            }
            return NextResponse.json({ error: 'City already has data' }, { status: 400 });
        }

        // Return empty council structure
        const emptyCouncilStructure = {
            cityId: params.cityId,
            parties: [],
            administrativeBodies: [
                {
                    name: "Δημοτικό Συμβούλιο",
                    name_en: "Municipal Council",
                    type: "council" as const,
                },
            ],
            people: [],
            roles: [],
        };

        return NextResponse.json(emptyCouncilStructure);
    } catch (error) {
        console.error('Error loading initial data:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST: Save city data
export async function POST(
    request: NextRequest,
    { params }: { params: { cityId: string } }
) {
    try {
        const user = await getCurrentUser();

        if (!user?.isSuperAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if city can use city creator
        const canUseCreator = await canUseCityCreator(params.cityId);
        if (!canUseCreator) {
            // Check if city exists to provide appropriate error message
            const city = await getCity(params.cityId);
            if (!city) {
                return NextResponse.json({ error: 'City not found' }, { status: 404 });
            }
            return NextResponse.json({ error: 'City already has data' }, { status: 400 });
        }

        const body = await request.json();
        const validatedData = cityPopulationSchema.parse(body);

        // Save all data in a single transaction
        const result = await prisma.$transaction(async (tx) => {
            // Create administrative bodies
            const adminBodies = await Promise.all(
                validatedData.administrativeBodies.map(adminBody =>
                    tx.administrativeBody.create({
                        data: {
                            name: adminBody.name,
                            name_en: adminBody.name_en,
                            type: adminBody.type as AdministrativeBodyType,
                            cityId: params.cityId,
                        },
                    })
                )
            );

            // Create parties
            const parties = await Promise.all(
                validatedData.parties.map(party =>
                    tx.party.create({
                        data: {
                            name: party.name,
                            name_en: party.name_en,
                            name_short: party.name_short,
                            name_short_en: party.name_short_en,
                            colorHex: party.colorHex,
                            logo: party.logo,
                            cityId: params.cityId,
                        },
                    })
                )
            );

            // Create people
            const people = await Promise.all(
                validatedData.people.map(person =>
                    tx.person.create({
                        data: {
                            name: person.name,
                            name_en: person.name_en,
                            name_short: person.name_short,
                            name_short_en: person.name_short_en,
                            image: person.image,
                            activeFrom: person.activeFrom ? new Date(person.activeFrom) : null,
                            activeTo: person.activeTo ? new Date(person.activeTo) : null,
                            profileUrl: person.profileUrl,
                            cityId: params.cityId
                        },
                    })
                )
            );

            // Create roles from people data
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
                                startDate: null,
                                endDate: null,
                                cityId: role.type === 'city' ? params.cityId : null,
                                partyId: role.type === 'party' ? party?.id : null,
                                administrativeBodyId: role.type === 'adminBody' ? adminBody?.id : null,
                            },
                        });
                    });
                })
            );

            // Set city as unlisted (no longer pending, but not yet publicly listed)
            await tx.city.update({
                where: { id: params.cityId },
                data: { status: 'unlisted' },
            });

            const totalRoles = validatedData.people.reduce((count, person) => count + (person.roles?.length || 0), 0);

            return {
                partiesCount: parties.length,
                peopleCount: people.length,
                rolesCount: totalRoles,
                adminBodiesCount: adminBodies.length,
            };
        });

        try {
            revalidateTag(`city:${params.cityId}`);
        } catch (error) {
            console.error('Error revalidating city:', error);
        }

        return NextResponse.json({
            success: true,
            message: 'City data saved successfully',
            stats: result,
        });
    } catch (error) {
        console.error('Error saving city data:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json({
                error: 'Invalid data format',
                details: error.errors
            }, { status: 400 });
        }

        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
} 
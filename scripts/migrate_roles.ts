import { PrismaClient, AdministrativeBodyType } from '@prisma/client';
import { Command } from 'commander';

const prisma = new PrismaClient();

interface MigrationStats {
    citiesProcessed: number;
    peopleProcessed: number;
    rolesCreated: number;
    cityCouncilsCreated: number;
    errors: string[];
}

const SPECIAL_ROLES = {
    MAYOR: {
        greek: 'Δήμαρχος',
        english: 'Mayor',
        isHead: true,
        attachToCity: true,
    },
    GENERAL_SECRETARY: {
        greek: ['Γενικός Γραμματέας', 'Γενική Γραμματέας'],
        english: 'General Secretary',
        isHead: false,
        attachToCity: true,
    },
    CHAIR: {
        greek: 'Πρόεδρος',
        english: 'Chair',
        isHead: true,
        attachToAdminBody: true,
    },
    SECRETARY: {
        greek: 'Γραμματέας',
        english: 'Secretary',
        isHead: false,
        attachToAdminBody: true,
    },
    DEPUTY_CHAIR: {
        greek: 'Αντιπρόεδρος',
        english: 'Deputy Chair',
        isHead: false,
        attachToAdminBody: true,
    },
    DEPUTY_MAYOR: {
        greek: 'Αντιδήμαρχος',
        english: 'Deputy Mayor',
        isHead: false,
        attachToCity: true,
    },
};

async function ensureCityCouncil(cityId: string, dryRun: boolean): Promise<string> {
    // Check if city council exists
    const existingCouncil = await prisma.administrativeBody.findFirst({
        where: {
            cityId,
            type: AdministrativeBodyType.council,
        },
    });

    if (existingCouncil) {
        return existingCouncil.id;
    }

    if (dryRun) {
        console.log(`[DRY RUN] Would create City Council for city ${cityId}`);
        return 'dry-run-id';
    }

    // Create new city council
    const newCouncil = await prisma.administrativeBody.create({
        data: {
            name: 'Δημοτικό Συμβούλιο',
            name_en: 'City Council',
            type: AdministrativeBodyType.council,
            cityId,
        },
    });

    // Attach all meetings to this council
    await prisma.councilMeeting.updateMany({
        where: {
            cityId,
            administrativeBodyId: null,
        },
        data: {
            administrativeBodyId: newCouncil.id,
        },
    });

    return newCouncil.id;
}

function determineRole(role: string | null): {
    name?: string;
    name_en?: string;
    isHead: boolean;
    attachToCity: boolean;
    attachToAdminBody: boolean;
    isAlsoCouncilMember: boolean;
} {
    if (!role) {
        return {
            isHead: false,
            attachToCity: false,
            attachToAdminBody: true,
            isAlsoCouncilMember: false, // they are already council members by default
        };
    }

    // Check for mayor or general secretary
    if (role === SPECIAL_ROLES.MAYOR.greek) {
        return {
            name: SPECIAL_ROLES.MAYOR.greek,
            name_en: SPECIAL_ROLES.MAYOR.english,
            isHead: SPECIAL_ROLES.MAYOR.isHead,
            attachToCity: true,
            attachToAdminBody: false,
            isAlsoCouncilMember: false,
        };
    }

    if (SPECIAL_ROLES.GENERAL_SECRETARY.greek.includes(role)) {
        return {
            name: role,
            name_en: SPECIAL_ROLES.GENERAL_SECRETARY.english,
            isHead: SPECIAL_ROLES.GENERAL_SECRETARY.isHead,
            attachToCity: true,
            attachToAdminBody: false,
            isAlsoCouncilMember: false,
        };
    }

    // Check for deputy mayor
    if (role.startsWith(SPECIAL_ROLES.DEPUTY_MAYOR.greek)) {
        return {
            name: role,
            name_en: role === SPECIAL_ROLES.DEPUTY_MAYOR.greek
                ? SPECIAL_ROLES.DEPUTY_MAYOR.english
                : `${SPECIAL_ROLES.DEPUTY_MAYOR.english} of ${role.replace(SPECIAL_ROLES.DEPUTY_MAYOR.greek + ' ', '')}`,
            isHead: SPECIAL_ROLES.DEPUTY_MAYOR.isHead,
            attachToCity: true,
            attachToAdminBody: false,
            isAlsoCouncilMember: true,
        };
    }

    // Check for council roles
    if (role === SPECIAL_ROLES.CHAIR.greek) {
        return {
            name: SPECIAL_ROLES.CHAIR.greek,
            name_en: SPECIAL_ROLES.CHAIR.english,
            isHead: SPECIAL_ROLES.CHAIR.isHead,
            attachToCity: false,
            attachToAdminBody: true,
            isAlsoCouncilMember: true,
        };
    }

    if (role === SPECIAL_ROLES.SECRETARY.greek) {
        return {
            name: SPECIAL_ROLES.SECRETARY.greek,
            name_en: SPECIAL_ROLES.SECRETARY.english,
            isHead: SPECIAL_ROLES.SECRETARY.isHead,
            attachToCity: false,
            attachToAdminBody: true,
            isAlsoCouncilMember: true,
        };
    }

    if (role === SPECIAL_ROLES.DEPUTY_CHAIR.greek) {
        return {
            name: SPECIAL_ROLES.DEPUTY_CHAIR.greek,
            name_en: SPECIAL_ROLES.DEPUTY_CHAIR.english,
            isHead: SPECIAL_ROLES.DEPUTY_CHAIR.isHead,
            attachToCity: false,
            attachToAdminBody: true,
            isAlsoCouncilMember: true,
        };
    }

    // Default case - regular council member
    return {
        isHead: false,
        attachToCity: false,
        attachToAdminBody: true,
        isAlsoCouncilMember: false, // they are already council members by default
    };
}

async function migrateRoles(dryRun: boolean): Promise<MigrationStats> {
    const stats: MigrationStats = {
        citiesProcessed: 0,
        peopleProcessed: 0,
        rolesCreated: 0,
        cityCouncilsCreated: 0,
        errors: [],
    };

    try {
        // Get all non-pending cities
        const cities = await prisma.city.findMany({
            where: {
                isPending: false,
            },
            include: {
                persons: true,
            },
        });

        for (const city of cities) {
            try {
                if (dryRun) {
                    console.log(`\n=== Processing city: ${city.name} (${city.name_en}) ===\n`);
                }

                // Ensure city council exists
                const cityCouncilId = await ensureCityCouncil(city.id, dryRun);
                if (!cityCouncilId && !dryRun) {
                    throw new Error(`Failed to create or find city council for city ${city.id}`);
                }

                // Process each person in the city
                for (const person of city.persons) {
                    try {
                        const roleInfo = determineRole(person.role);

                        if (dryRun) {
                            console.log(`[DRY RUN] Would create roles for ${person.name}:`);
                            if (roleInfo.attachToCity) {
                                console.log(`- City role: ${roleInfo.name || 'No name'} (isHead: ${roleInfo.isHead})`);
                            }
                            if (roleInfo.attachToAdminBody) {
                                if (roleInfo.name) {
                                    console.log(`- Administrative body role: ${roleInfo.name} (isHead: ${roleInfo.isHead})`);
                                } else {
                                    console.log(`- Regular council member role`);
                                }
                            }
                            if (roleInfo.isAlsoCouncilMember) {
                                console.log(`- Additional council member role`);
                            }
                            if (person.partyId) {
                                console.log(`- Party role: Member`);
                            }
                            continue;
                        }

                        // Create roles based on the determination
                        if (roleInfo.attachToCity) {
                            const data: any = {
                                personId: person.id,
                                cityId: city.id,
                                isHead: roleInfo.isHead,
                            };
                            if (roleInfo.name) data.name = roleInfo.name;
                            if (roleInfo.name_en) data.name_en = roleInfo.name_en;

                            await prisma.role.create({ data });
                            stats.rolesCreated++;
                        }

                        if (roleInfo.attachToAdminBody) {
                            // Create their special role (if any)
                            if (roleInfo.name) {
                                const data: any = {
                                    personId: person.id,
                                    administrativeBodyId: cityCouncilId,
                                    isHead: roleInfo.isHead,
                                    name: roleInfo.name,
                                };
                                if (roleInfo.name_en) data.name_en = roleInfo.name_en;

                                await prisma.role.create({ data });
                                stats.rolesCreated++;
                            } else {
                                // Regular council member
                                await prisma.role.create({
                                    data: {
                                        personId: person.id,
                                        administrativeBodyId: cityCouncilId,
                                        name: 'Μέλος Δημοτικού Συμβουλίου',
                                        name_en: 'City Council Member',
                                        isHead: false,
                                    },
                                });
                                stats.rolesCreated++;
                            }

                            // If they should also be a regular council member, create that role
                            if (roleInfo.isAlsoCouncilMember) {
                                await prisma.role.create({
                                    data: {
                                        personId: person.id,
                                        administrativeBodyId: cityCouncilId,
                                        name: 'Μέλος Δημοτικού Συμβουλίου',
                                        name_en: 'City Council Member',
                                        isHead: false,
                                    },
                                });
                                stats.rolesCreated++;
                            }
                        }

                        // Create party role if person belongs to a party
                        if (person.partyId) {
                            await prisma.role.create({
                                data: {
                                    personId: person.id,
                                    partyId: person.partyId,
                                    name: 'Μέλος',
                                    name_en: 'Member',
                                },
                            });
                            stats.rolesCreated++;
                        }

                        stats.peopleProcessed++;
                    } catch (error) {
                        stats.errors.push(`Error processing person ${person.id}: ${error}`);
                    }
                }

                stats.citiesProcessed++;
            } catch (error) {
                stats.errors.push(`Error processing city ${city.id}: ${error}`);
            }
        }
    } catch (error) {
        stats.errors.push(`General error: ${error}`);
    }

    return stats;
}

async function main() {
    const program = new Command();

    program
        .option('-d, --dry-run', 'Run in dry-run mode (no changes will be made)', false)
        .parse(process.argv);

    const options = program.opts();

    console.log(`Starting role migration${options.dryRun ? ' (DRY RUN)' : ''}...`);

    const stats = await migrateRoles(options.dryRun);

    console.log('\nMigration completed:');
    console.log(`Cities processed: ${stats.citiesProcessed}`);
    console.log(`People processed: ${stats.peopleProcessed}`);
    console.log(`Roles created: ${stats.rolesCreated}`);

    if (stats.errors.length > 0) {
        console.log('\nErrors encountered:');
        stats.errors.forEach((error, index) => {
            console.log(`${index + 1}. ${error}`);
        });
    }
}

main()
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

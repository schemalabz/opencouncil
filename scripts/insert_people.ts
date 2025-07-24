import fs from 'fs';
import csv from 'csv-parser';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

dotenv.config();

const prisma = new PrismaClient();

async function processCSV(filePath: string, cityId: string, dryRun: boolean) {
    const results: any[] = [];

    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', async () => {
                try {
                    console.log(`Found ${results.length} people to process`);

                    if (dryRun) {
                        console.log('Dry run - would insert these records:', results);
                        resolve(results);
                        return;
                    }

                    for (const person of results) {
                        // First create the person without the deprecated fields
                        const personData = {
                            name: person.name,
                            name_en: person.name_en,
                            name_short: person.name_short,
                            name_short_en: person.name_short_en,
                            cityId: cityId,
                        };

                        try {
                            // Create the person
                            const createdPerson = await prisma.person.create({
                                data: personData
                            });
                            console.log(`Created person: ${createdPerson.name}`);

                            // If they have a role, create it
                            if (person.role) {
                                await prisma.role.create({
                                    data: {
                                        personId: createdPerson.id,
                                        cityId: cityId,
                                        name: person.role,
                                        name_en: person.role_en,
                                        isHead: false,
                                    }
                                });
                                console.log(`Created city role for ${createdPerson.name}`);
                            }

                            // If they have a party, create a party role
                            if (person.partyId) {
                                await prisma.role.create({
                                    data: {
                                        personId: createdPerson.id,
                                        partyId: person.partyId,
                                        isHead: false,
                                    }
                                });
                                console.log(`Created party role for ${createdPerson.name}`);
                            }
                        } catch (error) {
                            console.error(`Failed to create person ${person.name}:`, error);
                        }
                    }

                    console.log('Finished processing all people');
                    resolve(results);
                } catch (error) {
                    console.error('Error processing CSV:', error);
                    reject(error);
                }
            });
    });
}

const argv = yargs(hideBin(process.argv))
    .option('csv', {
        alias: 'c',
        type: 'string',
        description: 'Path to the CSV file',
        demandOption: true
    })
    .option('city', {
        alias: 'i',
        type: 'string',
        description: 'City ID',
        demandOption: true
    })
    .option('dry-run', {
        alias: 'd',
        type: 'boolean',
        description: 'Perform a dry run without making changes',
        default: false
    })
    .help()
    .parseSync();

processCSV(path.resolve(argv.csv), argv.city, argv['dry-run'])
    .then(() => {
        console.log('CSV processing completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Failed to process CSV:', error);
        process.exit(1);
    });

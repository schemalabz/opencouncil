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
                        const personData = {
                            name: person.name,
                            name_en: person.name_en,
                            name_short: person.name_short,
                            name_short_en: person.name_short_en,
                            role: person.role || null,
                            role_en: person.role_en || null,
                            isAdministrativeRole: person.role ? true : false,
                            cityId: cityId,
                            partyId: person.partyId || null
                        };

                        try {
                            const createdPerson = await prisma.person.create({
                                data: personData
                            });
                            console.log(`Created person: ${createdPerson.name}`);
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

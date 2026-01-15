import fs from 'fs';
import csv from 'csv-parser';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const prisma = new PrismaClient();

interface CSVRow {
  name: string;
  name_en: string;
  name_short: string;
  name_short_en: string;
  party_name: string;
  municipal_community: string;
  is_chair: string;
}

interface CommunityMember {
  name: string;
  name_en: string;
  name_short: string;
  name_short_en: string;
  partyName: string;
  communityNumber: number;
  isChair: boolean;
}

async function readCSV(filePath: string): Promise<CommunityMember[]> {
  return new Promise((resolve, reject) => {
    const results: CommunityMember[] = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row: CSVRow) => {
        results.push({
          name: row.name,
          name_en: row.name_en,
          name_short: row.name_short,
          name_short_en: row.name_short_en,
          partyName: row.party_name,
          communityNumber: parseInt(row.municipal_community),
          isChair: row.is_chair === 'true',
        });
      })
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

async function main() {
  // Parse command-line arguments
  const args = process.argv.slice(2);
  let cityId: string | undefined;
  let csvPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--city-id' && i + 1 < args.length) {
      cityId = args[i + 1];
      i++;
    } else if (args[i] === '--csv' && i + 1 < args.length) {
      csvPath = args[i + 1];
      i++;
    }
  }

  if (!cityId || !csvPath) {
    console.error('Usage: npx tsx scripts/insert_athens_communities.ts --city-id <cityId> --csv <csvPath>');
    console.error('Example: npx tsx scripts/insert_athens_communities.ts --city-id athens --csv athens_community_councillors.csv');
    process.exit(1);
  }

  console.log(`Starting community councils import for city: ${cityId}...`);

  // Read CSV file
  const resolvedCsvPath = path.isAbsolute(csvPath) ? csvPath : path.join(process.cwd(), csvPath);
  console.log(`\nReading CSV from: ${resolvedCsvPath}`);
  const communityMembers = await readCSV(resolvedCsvPath);
  console.log(`  ✓ Loaded ${communityMembers.length} members from CSV`);

  // Query for party IDs by name
  console.log('\nQuerying party IDs from database...');
  const parties = await prisma.party.findMany({
    where: {
      cityId: cityId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  const partyNameToId: { [name: string]: string } = {};
  for (const party of parties) {
    partyNameToId[party.name] = party.id;
    console.log(`  ✓ Found party: ${party.name} (${party.id})`);
  }

  // Validate that all party names in CSV exist in database
  const uniquePartyNames = [...new Set(communityMembers.map(m => m.partyName))];
  const missingParties = uniquePartyNames.filter(name => !partyNameToId[name]);
  if (missingParties.length > 0) {
    console.error('\n❌ Error: The following parties in CSV are not found in database:');
    missingParties.forEach(name => console.error(`  - ${name}`));
    process.exit(1);
  }

  // Determine unique community numbers from CSV
  const uniqueCommunityNumbers = [...new Set(communityMembers.map(m => m.communityNumber))].sort((a, b) => a - b);
  console.log(`\n1. Creating ${uniqueCommunityNumbers.length} administrative bodies...`);
  console.log(`   Community numbers found in CSV: ${uniqueCommunityNumbers.join(', ')}`);

  // Helper function to get Greek ordinal
  const getGreekOrdinal = (num: number): string => {
    const ordinals: { [key: number]: string } = {
      1: '1η', 2: '2η', 3: '3η', 4: '4η', 5: '5η',
      6: '6η', 7: '7η', 8: '8η', 9: '9η', 10: '10η',
      11: '11η', 12: '12η', 13: '13η', 14: '14η', 15: '15η',
      16: '16η', 17: '17η', 18: '18η', 19: '19η', 20: '20η'
    };
    return ordinals[num] || `${num}η`;
  };

  // Helper function to get English ordinal
  const getEnglishOrdinal = (num: number): string => {
    const ordinals: { [key: number]: string } = {
      1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th',
      6: '6th', 7: '7th', 8: '8th', 9: '9th', 10: '10th',
      11: '11th', 12: '12th', 13: '13th', 14: '14th', 15: '15th',
      16: '16th', 17: '17th', 18: '18th', 19: '19th', 20: '20th'
    };
    return ordinals[num] || `${num}th`;
  };

  // Create administrative bodies for each unique community number
  const communityMap = new Map<number, any>();
  for (const communityNum of uniqueCommunityNumbers) {
    const community = await prisma.administrativeBody.create({
      data: {
        name: `${getGreekOrdinal(communityNum)} Δημοτική Κοινότητα`,
        name_en: `${getEnglishOrdinal(communityNum)} Municipal Community`,
        type: 'community',
        notificationBehavior: 'NOTIFICATIONS_APPROVAL',
        cityId: cityId,
      },
    });
    communityMap.set(communityNum, community);
    console.log(`  ✓ Created ${community.name_en} (${community.id})`);
  }

  // Insert all persons
  console.log(`\n2. Creating ${communityMembers.length} persons...`);
  const createdPersons: { [name: string]: string } = {};

  for (const member of communityMembers) {
    try {
      const person = await prisma.person.create({
        data: {
          name: member.name,
          name_en: member.name_en,
          name_short: member.name_short,
          name_short_en: member.name_short_en,
          cityId: cityId,
        },
      });
      createdPersons[member.name] = person.id;
      console.log(`  ✓ Created ${person.name} (${person.name_short})`);
    } catch (error) {
      console.error(`  ✗ Failed to create ${member.name}:`, error);
    }
  }

  // Create roles linking persons to their parties
  console.log(`\n3. Creating party roles...`);
  let partyRoleCount = 0;
  for (const member of communityMembers) {
    const personId = createdPersons[member.name];
    if (!personId) continue;

    const partyId = partyNameToId[member.partyName];
    if (!partyId) {
      console.error(`  ✗ Party not found for ${member.name}: ${member.partyName}`);
      continue;
    }

    try {
      await prisma.role.create({
        data: {
          personId,
          cityId: cityId,
          partyId,
          isHead: false,
        },
      });
      partyRoleCount++;
    } catch (error) {
      console.error(`  ✗ Failed to create party role for ${member.name}:`, error);
    }
  }
  console.log(`  ✓ Created ${partyRoleCount} party roles`);

  // Create roles linking persons to their community administrative bodies
  console.log(`\n4. Creating community roles...`);
  let communityRoleCount = 0;
  let chairCount = 0;
  for (const member of communityMembers) {
    const personId = createdPersons[member.name];
    if (!personId) continue;

    const community = communityMap.get(member.communityNumber);
    if (!community) {
      console.error(`  ✗ Community ${member.communityNumber} not found for ${member.name}`);
      continue;
    }

    try {
      await prisma.role.create({
        data: {
          personId,
          cityId: cityId,
          administrativeBodyId: community.id,
          isHead: member.isChair,
        },
      });
      communityRoleCount++;
      if (member.isChair) chairCount++;
    } catch (error) {
      console.error(`  ✗ Failed to create community role for ${member.name}:`, error);
    }
  }
  console.log(`  ✓ Created ${communityRoleCount} community roles (${chairCount} chairs)`);

  console.log('\n✅ Import completed successfully!');
  console.log(`\nSummary:`);
  console.log(`  - Administrative Bodies: ${communityMap.size}`);
  console.log(`  - Persons: ${Object.keys(createdPersons).length}`);
  console.log(`  - Party Roles: ${partyRoleCount}`);
  console.log(`  - Community Roles: ${communityRoleCount} (${chairCount} chairs)`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
